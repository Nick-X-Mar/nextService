import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getStripe } from '@/lib/stripe-server'
import { ensurePaymentsTable } from '@/utils/ensurePaymentTables'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const sig = request.headers.get('stripe-signature')

    if (!sig) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — rejecting webhook')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const stripe = getStripe()
    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret)

    await ensurePaymentsTable()
    const paymentsTable = process.env.PAYMENTS_TABLE || 'Payments'
    const now = new Date().toISOString()

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object
        await dynamoDB.send(
          new UpdateCommand({
            TableName: paymentsTable,
            Key: { paymentId: pi.id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'succeeded', ':now': now }
          })
        )

        logEvent({
          eventName: EventName.PaymentSucceeded,
          actorType: 'system',
          clientId: pi.metadata?.clientId,
          garageId: pi.metadata?.garageId,
          requestId: pi.metadata?.requestId,
          offerId: pi.metadata?.offerId,
          source: 'webhooks/stripe',
          metadata: {
            paymentIntentId: pi.id,
            amount: pi.amount,
            currency: pi.currency
          }
        })
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        await dynamoDB.send(
          new UpdateCommand({
            TableName: paymentsTable,
            Key: { paymentId: pi.id },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'failed', ':now': now }
          })
        )

        logEvent({
          eventName: EventName.PaymentFailed,
          actorType: 'system',
          clientId: pi.metadata?.clientId,
          garageId: pi.metadata?.garageId,
          requestId: pi.metadata?.requestId,
          offerId: pi.metadata?.offerId,
          source: 'webhooks/stripe',
          metadata: {
            paymentIntentId: pi.id,
            errorMessage: pi.last_payment_error?.message || 'unknown'
          }
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    )
  }
}
