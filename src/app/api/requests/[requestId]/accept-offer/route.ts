import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { getStripe, DEPOSIT_PERCENT } from '@/lib/stripe-server'
import { requireClient } from '@/utils/requireAuth'
import { generatePresignedUrls, presignPhotoRecords } from '@/utils/s3Service'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'

const checkAcceptRate = createRateLimiter('accept-offer', 5, 3600000)

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { offerId, appointmentDate, appointmentPrice, paymentIntentId } = body || {}

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

    if (!offerId) {
      return NextResponse.json(
        { success: false, error: 'offerId is required' },
        { status: 400 }
      )
    }

    if (!appointmentDate || typeof appointmentDate !== 'string') {
      return NextResponse.json(
        { success: false, error: 'appointmentDate is required' },
        { status: 400 }
      )
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(appointmentDate)) {
      return NextResponse.json(
        { success: false, error: 'appointmentDate must be in format YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const parsed = new Date(`${appointmentDate}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, error: 'appointmentDate is not a valid date' },
        { status: 400 }
      )
    }

    // Authorization: only the owning client can accept an offer
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    if (!checkAcceptRate(clientId)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const fetchRes = await dynamoDB.send(
      new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
    )
    const serviceRequest = fetchRes.Item

    if (!serviceRequest) {
      return NextResponse.json(
        { success: false, error: 'Service request not found' },
        { status: 404 }
      )
    }

    if (clientId !== serviceRequest.clientId) {
      return NextResponse.json(
        { success: false, error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' },
        { status: 403 }
      )
    }

    // Verify payment if payments are enabled
    let depositAmount: number | null = null
    let remainingAmount: number | null = null

    if (paymentsEnabled) {
      if (!paymentIntentId) {
        return NextResponse.json(
          { success: false, error: 'Payment is required to accept this offer' },
          { status: 400 }
        )
      }

      const stripe = getStripe()
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

      if (paymentIntent.status !== 'succeeded') {
        return NextResponse.json(
          { success: false, error: 'Payment has not been completed' },
          { status: 400 }
        )
      }

      if (paymentIntent.metadata?.requestId !== requestId || paymentIntent.metadata?.offerId !== offerId) {
        return NextResponse.json(
          { success: false, error: 'Payment does not match this request/offer' },
          { status: 400 }
        )
      }

      const price = typeof appointmentPrice === 'number' ? appointmentPrice : 0
      depositAmount = Math.round(price * (DEPOSIT_PERCENT / 100) * 100) / 100
      remainingAmount = Math.round((price - depositAmount) * 100) / 100
    }

    // Update the service request with appointment details
    const updatedAt = new Date().toISOString()

    const updateExpressionParts = [
      '#status = :status',
      'acceptedOfferId = :acceptedOfferId',
      'appointmentDate = :appointmentDate',
      'appointmentPrice = :appointmentPrice',
      'updatedAt = :updatedAt'
    ]
    const exprAttrValues: Record<string, unknown> = {
      ':status': ServiceRequestStatus.APPOINTMENT,
      ':acceptedOfferId': offerId,
      ':appointmentDate': appointmentDate,
      ':appointmentPrice':
        typeof appointmentPrice === 'number' && !Number.isNaN(appointmentPrice)
          ? appointmentPrice
          : null,
      ':updatedAt': updatedAt
    }

    if (paymentsEnabled && paymentIntentId) {
      updateExpressionParts.push(
        'paymentIntentId = :paymentIntentId',
        'depositAmount = :depositAmount',
        'remainingAmount = :remainingAmount'
      )
      exprAttrValues[':paymentIntentId'] = paymentIntentId
      exprAttrValues[':depositAmount'] = depositAmount
      exprAttrValues[':remainingAmount'] = remainingAmount
    }

    const updateRequestCommand = new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: exprAttrValues,
      ReturnValues: 'ALL_NEW'
    })

    const updateRequestResult = await dynamoDB.send(updateRequestCommand)

    if (!updateRequestResult.Attributes) {
      return NextResponse.json(
        { success: false, error: 'Service request not found' },
        { status: 404 }
      )
    }

    const updatedRequest = updateRequestResult.Attributes

    // Then, update all related offers: one accepted, all others rejected
    // Offers.ServiceRequestOffersIndex is keyed on serviceRequestId — no need
    // to read every offer in the table to find the ones on this request.
    const offersResult = await dynamoDB.send(new QueryCommand({
      TableName: 'Offers',
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :serviceRequestId',
      ExpressionAttributeValues: { ':serviceRequestId': requestId }
    }))
    const offers = offersResult.Items || []

    const updateOfferPromises = offers.map((offer) => {
      const isAccepted = offer.id === offerId

      const updateExpressionParts = [
        '#status = :status',
        'updatedAt = :updatedAt'
      ]
      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status'
      }
      const expressionAttributeValues: Record<string, unknown> = {
        ':status': isAccepted ? OfferStatus.ACCEPTED : OfferStatus.REJECTED,
        ':updatedAt': updatedAt
      }

      if (isAccepted) {
        updateExpressionParts.push(
          'appointmentDate = :appointmentDate',
          'appointmentPrice = :appointmentPrice'
        )
        expressionAttributeValues[':appointmentDate'] = appointmentDate
        expressionAttributeValues[':appointmentPrice'] =
          typeof appointmentPrice === 'number' && !Number.isNaN(appointmentPrice)
            ? appointmentPrice
            : offer.offerAmount ?? null
      }

      const updateOfferCommand = new UpdateCommand({
        TableName: 'Offers',
        Key: { id: offer.id },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      })

      return dynamoDB.send(updateOfferCommand)
    })

    if (updateOfferPromises.length > 0) {
      await Promise.all(updateOfferPromises)
    }

    const acceptedOffer = offers.find((o) => o.id === offerId)
    const acceptingGarageId = (acceptedOffer?.garageId as string | undefined) ?? undefined

    logEvent({
      eventName: EventName.OfferAccepted,
      actorType: 'client',
      actorId: updatedRequest.clientId,
      clientId: updatedRequest.clientId,
      garageId: acceptingGarageId,
      requestId,
      offerId,
      source: 'api/requests/[requestId]/accept-offer',
      metadata: { appointmentDate, appointmentPrice: appointmentPrice ?? null }
    })

    logEvent({
      eventName: EventName.AppointmentScheduled,
      actorType: 'system',
      clientId: updatedRequest.clientId,
      garageId: acceptingGarageId,
      requestId,
      offerId,
      source: 'api/requests/[requestId]/accept-offer',
      metadata: { appointmentDate, appointmentPrice: appointmentPrice ?? null }
    })

    for (const offer of offers) {
      if (offer.id !== offerId) {
        logEvent({
          eventName: EventName.OfferRejected,
          actorType: 'system',
          actorId: updatedRequest.clientId,
          clientId: updatedRequest.clientId,
          garageId: offer.garageId,
          requestId,
          offerId: offer.id,
          source: 'api/requests/[requestId]/accept-offer',
          metadata: { reason: 'another_offer_accepted' }
        })
      }
    }

    // Tell every garage dashboard listening on the realtime channel to drop
    // this request from their list — once an offer is accepted it's no longer
    // available to anyone else.
    void broadcastRequestUpdate(requestId, ServiceRequestStatus.APPOINTMENT, 'offer_accepted')

    // Fire both confirmation emails (best-effort, never block).
    void notifyAcceptanceParticipants({
      clientId: updatedRequest.clientId,
      garageId: acceptingGarageId,
      requestId,
      offerId,
      appointmentDate,
      appointmentPrice: typeof appointmentPrice === 'number' ? appointmentPrice : undefined,
      depositAmount: depositAmount ?? undefined,
      remainingAmount: remainingAmount ?? undefined
    })

    return NextResponse.json({
      success: true,
      request: {
        id: updatedRequest.id,
        clientId: updatedRequest.clientId,
        vehicleId: updatedRequest.vehicleId,
        category: updatedRequest.category,
        description: updatedRequest.description,
        status: updatedRequest.status,
        estimatedCost: updatedRequest.estimatedCost,
        photoUrls: (updatedRequest.photoUrls?.length > 0
          ? await generatePresignedUrls(updatedRequest.photoUrls)
          : []),
        photos: (updatedRequest.photos?.length > 0
          ? await presignPhotoRecords(updatedRequest.photos)
          : []),
        createdAt: updatedRequest.createdAt,
        updatedAt: updatedRequest.updatedAt,
        clientAvailabilityDates: updatedRequest.clientAvailabilityDates || [],
        acceptedOfferId: updatedRequest.acceptedOfferId,
        appointmentDate: updatedRequest.appointmentDate,
        appointmentPrice: updatedRequest.appointmentPrice
      }
    })
  } catch (error) {
    console.error('Error accepting offer for request:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to accept offer for this request',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function notifyAcceptanceParticipants(args: {
  clientId: string
  garageId?: string
  requestId: string
  offerId: string
  appointmentDate: string
  appointmentPrice?: number
  depositAmount?: number
  remainingAmount?: number
}): Promise<void> {
  try {
    const [clientRes, garageRes] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: 'Clients', Key: { id: args.clientId } })),
      args.garageId
        ? dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: args.garageId } }))
        : Promise.resolve({ Item: undefined as Record<string, unknown> | undefined })
    ])

    const clientEmail = clientRes.Item?.email as string | undefined
    const garageEmail = garageRes.Item?.email as string | undefined
    const garageName = (garageRes.Item?.companyName as string) || 'συνεργείο'

    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        templateName: EmailTemplate.AppointmentConfirmationClient,
        variables: {
          clientId: args.clientId,
          requestId: args.requestId,
          garageName,
          appointmentDate: args.appointmentDate,
          appointmentPrice: args.appointmentPrice !== undefined ? String(args.appointmentPrice) : ''
        },
        triggerEvent: EventName.OfferAccepted,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }

    // Payment confirmation email (when deposit was paid)
    if (clientEmail && args.depositAmount !== undefined) {
      sendEmail({
        to: clientEmail,
        templateName: EmailTemplate.PaymentConfirmationClient,
        variables: {
          clientId: args.clientId,
          requestId: args.requestId,
          garageName,
          appointmentDate: args.appointmentDate,
          depositAmount: String(args.depositAmount),
          remainingAmount: String(args.remainingAmount ?? '')
        },
        triggerEvent: EventName.PaymentSucceeded,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }

    if (garageEmail && args.garageId) {
      sendEmail({
        to: garageEmail,
        templateName: EmailTemplate.OfferAcceptedGarage,
        variables: {
          garageId: args.garageId,
          appointmentDate: args.appointmentDate,
          offerAmount: args.appointmentPrice !== undefined ? String(args.appointmentPrice) : ''
        },
        triggerEvent: EventName.OfferAccepted,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }
  } catch (err) {
    console.error('[accept-offer] notifyAcceptanceParticipants failed:', err)
  }
}

export const PATCH = withMetrics(_PATCH)
