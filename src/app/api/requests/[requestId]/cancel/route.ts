import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { CANCELLATION_DEADLINE_DAYS, WALLET_CANCELLATION_REFUND_PERCENT } from '@/lib/stripe-server'
import { ensureWalletTransactionsTable } from '@/utils/ensurePaymentTables'
import { randomUUID } from 'crypto'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { requireClient } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkCancelRate = createRateLimiter('request-cancel', 3, 3600000)

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

    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    if (!checkCancelRate(clientId)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες ακύρωσης. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    // Fetch the service request
    const requestRes = await dynamoDB.send(
      new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
    )
    const serviceRequest = requestRes.Item

    if (!serviceRequest) {
      return NextResponse.json(
        { success: false, error: 'Service request not found' },
        { status: 404 }
      )
    }

    if (serviceRequest.clientId !== clientId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    if (serviceRequest.status !== ServiceRequestStatus.APPOINTMENT) {
      return NextResponse.json(
        { success: false, error: 'Only appointments can be cancelled' },
        { status: 400 }
      )
    }

    // Calculate refund eligibility
    const appointmentDate = serviceRequest.appointmentDate as string
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysBeforeAppointment = differenceInCalendarDays(
      parseISO(appointmentDate),
      today
    )

    const refundsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_REFUNDS_ENABLED === 'true'
    const depositAmount = (serviceRequest.depositAmount as number) ?? 0
    const eligible = daysBeforeAppointment >= CANCELLATION_DEADLINE_DAYS && depositAmount > 0
    let refundPoints = 0

    if (eligible && refundsEnabled) {
      refundPoints = Math.round(depositAmount * (WALLET_CANCELLATION_REFUND_PERCENT / 100) * 100) / 100
    }

    const now = new Date().toISOString()

    // Update service request to CANCELLED
    await dynamoDB.send(
      new UpdateCommand({
        TableName: 'ServiceRequests',
        Key: { id: requestId },
        UpdateExpression: 'SET #status = :status, cancelledAt = :cancelledAt, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': ServiceRequestStatus.CANCELLED,
          ':cancelledAt': now,
          ':updatedAt': now
        }
      })
    )

    // Update accepted offer to REJECTED
    if (serviceRequest.acceptedOfferId) {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: 'Offers',
          Key: { id: serviceRequest.acceptedOfferId },
          UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': OfferStatus.REJECTED,
            ':updatedAt': now
          }
        })
      )
    }

    // Credit wallet if eligible
    if (refundPoints > 0) {
      await ensureWalletTransactionsTable()

      // Write wallet transaction
      await dynamoDB.send(
        new PutCommand({
          TableName: process.env.WALLET_TRANSACTIONS_TABLE || 'WalletTransactions',
          Item: {
            transactionId: randomUUID(),
            clientId,
            type: 'credit',
            points: refundPoints,
            reason: 'cancellation_refund',
            requestId,
            createdAt: now
          }
        })
      )

      // Atomically increment wallet balance
      await dynamoDB.send(
        new UpdateCommand({
          TableName: 'Clients',
          Key: { id: clientId },
          UpdateExpression: 'ADD walletBalance :points',
          ExpressionAttributeValues: { ':points': refundPoints }
        })
      )

      logEvent({
        eventName: EventName.WalletCredited,
        actorType: 'system',
        clientId,
        requestId,
        source: 'api/requests/[requestId]/cancel',
        metadata: { points: refundPoints, reason: 'cancellation_refund' }
      })
    }

    // Fetch garage info for logging/emails
    const acceptedOffer = serviceRequest.acceptedOfferId
      ? (await dynamoDB.send(
          new GetCommand({ TableName: 'Offers', Key: { id: serviceRequest.acceptedOfferId } })
        )).Item
      : null
    const garageId = (acceptedOffer?.garageId as string) || undefined

    // Log cancellation event
    logEvent({
      eventName: EventName.AppointmentCancelled,
      actorType: 'client',
      actorId: clientId,
      clientId,
      garageId,
      requestId,
      source: 'api/requests/[requestId]/cancel',
      metadata: {
        depositAmount,
        eligible,
        refundPoints,
        daysBeforeAppointment,
        appointmentDate
      }
    })

    // Send cancellation emails
    void notifyCancellationParticipants({
      clientId,
      garageId,
      requestId,
      appointmentDate,
      refundPoints: refundPoints > 0 ? refundPoints : undefined
    })

    return NextResponse.json({
      success: true,
      eligible,
      refundPoints: refundPoints > 0 ? refundPoints : null,
      daysBeforeAppointment
    })
  } catch (error) {
    console.error('Error cancelling appointment:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cancel appointment',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function notifyCancellationParticipants(args: {
  clientId: string
  garageId?: string
  requestId: string
  appointmentDate: string
  refundPoints?: number
}): Promise<void> {
  try {
    const [clientRes, garageRes] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: 'Clients', Key: { id: args.clientId } })),
      args.garageId
        ? dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: args.garageId } }))
        : Promise.resolve({ Item: undefined as Record<string, unknown> | undefined })
    ])

    const clientEmail = clientRes.Item?.email as string | undefined
    const clientName = [clientRes.Item?.firstName, clientRes.Item?.lastName].filter(Boolean).join(' ') || 'πελάτης'
    const garageEmail = garageRes.Item?.email as string | undefined
    const garageName = (garageRes.Item?.companyName as string) || 'συνεργείο'

    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        templateName: EmailTemplate.CancellationConfirmationClient,
        variables: {
          clientId: args.clientId,
          requestId: args.requestId,
          garageName,
          appointmentDate: args.appointmentDate,
          refundPoints: args.refundPoints ? String(args.refundPoints) : ''
        },
        triggerEvent: EventName.AppointmentCancelled,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }

    if (garageEmail && args.garageId) {
      sendEmail({
        to: garageEmail,
        templateName: EmailTemplate.CancellationNotificationGarage,
        variables: {
          garageId: args.garageId,
          clientName,
          appointmentDate: args.appointmentDate
        },
        triggerEvent: EventName.AppointmentCancelled,
        clientId: args.clientId,
        garageId: args.garageId,
        requestId: args.requestId
      })
    }
  } catch (err) {
    console.error('[cancel] notifyCancellationParticipants failed:', err)
  }
}

export const PATCH = withMetrics(_PATCH)
