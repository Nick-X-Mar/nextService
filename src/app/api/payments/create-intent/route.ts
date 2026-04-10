import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { getStripe, DEPOSIT_PERCENT } from '@/lib/stripe-server'
import { ensurePaymentsTable } from '@/utils/ensurePaymentTables'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import type { PaymentRecord, SavedCard } from '@/types/payments'
import { requireClient } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'

const checkPaymentRate = createRateLimiter('payment-create', 5, 3600000)

export async function POST(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    if (!checkPaymentRate(clientId)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες πληρωμής. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') {
      return NextResponse.json(
        { success: false, error: 'Payments are not enabled' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { requestId, offerId } = body || {}

    if (!requestId || !offerId) {
      return NextResponse.json(
        { success: false, error: 'requestId and offerId are required' },
        { status: 400 }
      )
    }

    const stripe = getStripe()

    // Fetch client to get/create Stripe customer
    const clientRes = await dynamoDB.send(
      new GetCommand({ TableName: 'Clients', Key: { id: clientId } })
    )
    const client = clientRes.Item
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Client not found' },
        { status: 404 }
      )
    }

    // Fetch offer to get garageId and the authoritative offerAmount
    const offerRes = await dynamoDB.send(
      new GetCommand({ TableName: 'Offers', Key: { id: offerId } })
    )
    const offer = offerRes.Item
    if (!offer || typeof offer.offerAmount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Offer not found or has no amount' },
        { status: 404 }
      )
    }
    const offerAmount = offer.offerAmount as number
    const garageId = (offer?.garageId as string) || ''

    // Get or create Stripe Customer
    let stripeCustomerId = client.stripeCustomerId as string | undefined
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: (client.email as string) || undefined,
        name: [client.firstName, client.lastName].filter(Boolean).join(' ') || undefined,
        metadata: { clientId }
      })
      stripeCustomerId = customer.id

      // Save stripeCustomerId to client record
      await dynamoDB.send(
        new UpdateCommand({
          TableName: 'Clients',
          Key: { id: clientId },
          UpdateExpression: 'SET stripeCustomerId = :scid',
          ExpressionAttributeValues: { ':scid': stripeCustomerId }
        })
      )
    }

    // Calculate deposit
    const depositAmountCents = Math.round(offerAmount * (DEPOSIT_PERCENT / 100) * 100)
    const depositAmount = Math.round(offerAmount * (DEPOSIT_PERCENT / 100) * 100) / 100
    const remainingAmount = Math.round((offerAmount - depositAmount) * 100) / 100

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositAmountCents,
      currency: 'eur',
      customer: stripeCustomerId,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        clientId,
        requestId,
        offerId,
        garageId,
        depositPercent: String(DEPOSIT_PERCENT),
        totalOfferAmount: String(offerAmount)
      }
    })

    // Fetch saved cards
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card'
    })

    const savedCards: SavedCard[] = paymentMethods.data.map((pm) => ({
      paymentMethodId: pm.id,
      brand: pm.card?.brand || 'unknown',
      last4: pm.card?.last4 || '****',
      expMonth: pm.card?.exp_month || 0,
      expYear: pm.card?.exp_year || 0
    }))

    // Write payment record to DynamoDB
    await ensurePaymentsTable()
    const now = new Date().toISOString()
    const paymentRecord: PaymentRecord = {
      paymentId: paymentIntent.id,
      clientId,
      garageId,
      requestId,
      offerId,
      stripeCustomerId,
      amount: depositAmountCents,
      depositPercent: DEPOSIT_PERCENT,
      totalOfferAmount: Math.round(offerAmount * 100),
      currency: 'eur',
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }

    await dynamoDB.send(
      new PutCommand({
        TableName: process.env.PAYMENTS_TABLE || 'Payments',
        Item: paymentRecord
      })
    )

    // Log event
    logEvent({
      eventName: EventName.PaymentInitiated,
      actorType: 'client',
      actorId: clientId,
      clientId,
      garageId,
      requestId,
      offerId,
      source: 'api/payments/create-intent',
      metadata: { depositAmount, offerAmount, depositPercent: DEPOSIT_PERCENT }
    })

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId,
      depositAmount,
      depositAmountCents,
      remainingAmount,
      savedCards
    })
  } catch (error) {
    console.error('Error creating payment intent:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create payment intent',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}
