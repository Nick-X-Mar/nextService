import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { sendEmail } from '@/utils/emailService'
import { EventName, EmailTemplate } from '@/types/events'
import { CANCELLATION_DEADLINE_DAYS, WALLET_CANCELLATION_REFUND_PERCENT } from '@/lib/stripe-server'
import { ensureWalletTransactionsTable } from '@/utils/ensurePaymentTables'
import { athensDaysUntil } from '@/utils/athensTime'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import { invalidateUnread } from '@/utils/unreadCache'
import { requireClient } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { quotingFirstName } from '@/utils/garageClientView'

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
        { success: false, error: 'Μόνο ένα προγραμματισμένο ραντεβού μπορεί να ακυρωθεί.' },
        { status: 409 }
      )
    }

    const appointmentDate = serviceRequest.appointmentDate as string
    const appointmentTime = serviceRequest.appointmentTime as string | null | undefined

    // Once the slot has begun only the garage can say what happened. A cancel
    // here would wipe out a job that took place — or a no-show — along with
    // its commission and both reviews.
    if (hasAppointmentStarted(appointmentDate, appointmentTime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Το ραντεβού έχει ήδη ξεκινήσει και δεν μπορεί πλέον να ακυρωθεί. Επικοινωνήστε με το συνεργείο.'
        },
        { status: 409 }
      )
    }

    // Calculate refund eligibility, in Athens calendar days like the date itself.
    const daysBeforeAppointment = athensDaysUntil(appointmentDate) ?? 0

    const refundsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_REFUNDS_ENABLED === 'true'
    const depositAmount = (serviceRequest.depositAmount as number) ?? 0
    const eligible = daysBeforeAppointment >= CANCELLATION_DEADLINE_DAYS && depositAmount > 0
    let refundPoints = 0

    if (eligible && refundsEnabled) {
      refundPoints = Math.round(depositAmount * (WALLET_CANCELLATION_REFUND_PERCENT / 100) * 100) / 100
    }

    const now = new Date().toISOString()

    const acceptedOfferId = typeof serviceRequest.acceptedOfferId === 'string' ? serviceRequest.acceptedOfferId : null

    // The request and its accepted offer change in one transaction. Written one
    // after the other, a failure in between left the offer ACCEPTED on a
    // cancelled job — still on the garage's books — and a retry could not fix
    // it, because the request was already past its condition.
    //
    // Conditional on the state checked above: a cancel racing the garage's
    // completion must not overwrite COMPLETED, and two cancels racing each
    // other must not both get past this line — everything below it, the
    // wallet credit included, runs at most once per appointment.
    try {
      await dynamoDB.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'ServiceRequests',
              Key: { id: requestId },
              UpdateExpression: 'SET #status = :status, cancelledAt = :cancelledAt, updatedAt = :updatedAt',
              ConditionExpression: acceptedOfferId
                ? '#status = :appointment AND acceptedOfferId = :offerId'
                : '#status = :appointment',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':status': ServiceRequestStatus.CANCELLED,
                ':appointment': ServiceRequestStatus.APPOINTMENT,
                ':cancelledAt': now,
                ':updatedAt': now,
                ...(acceptedOfferId ? { ':offerId': acceptedOfferId } : {})
              }
            }
          },
          ...(acceptedOfferId
            ? [{
                Update: {
                  TableName: 'Offers',
                  Key: { id: acceptedOfferId },
                  UpdateExpression: 'SET #status = :rejected, updatedAt = :updatedAt',
                  // Exists and belongs to this request — an update on a missing
                  // key would quietly create a stray offer row instead.
                  ConditionExpression: 'attribute_exists(id) AND serviceRequestId = :requestId',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: {
                    ':rejected': OfferStatus.REJECTED,
                    ':requestId': requestId,
                    ':updatedAt': now
                  }
                }
              }]
            : [])
        ]
      }))
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const [requestReason, offerReason] = err.CancellationReasons ?? []
        if (requestReason?.Code === 'ConditionalCheckFailed') {
          return NextResponse.json(
            { success: false, error: 'Το ραντεβού έχει ήδη ακυρωθεί ή ολοκληρωθεί.' },
            { status: 409 }
          )
        }
        if (offerReason?.Code === 'ConditionalCheckFailed') {
          console.error(`[cancel] accepted offer ${acceptedOfferId} of ${requestId} is missing or misfiled`)
          return NextResponse.json(
            { success: false, error: 'Δεν ήταν δυνατή η ακύρωση του ραντεβού. Επικοινωνήστε μαζί μας.' },
            { status: 409 }
          )
        }
        // A concurrent write held the same rows; nothing was applied.
        return NextResponse.json(
          { success: false, code: 'WRITE_CONFLICT', error: 'Το ραντεβού ενημερωνόταν την ίδια στιγμή. Δοκιμάστε ξανά.' },
          { status: 409 }
        )
      }
      throw err
    }

    // Credit wallet if eligible. After the transaction rather than inside it:
    // the credit is a separate concern (refunds are off at go-live) and must
    // never be the reason a cancel fails. The transaction id is derived from
    // the request, so the credit can land at most once per appointment even if
    // this is ever retried.
    if (refundPoints > 0) {
      try {
        await ensureWalletTransactionsTable()
        await dynamoDB.send(new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: process.env.WALLET_TRANSACTIONS_TABLE || 'WalletTransactions',
                Item: {
                  transactionId: `cancellation_refund_${requestId}`,
                  clientId,
                  type: 'credit',
                  points: refundPoints,
                  reason: 'cancellation_refund',
                  requestId,
                  createdAt: now
                },
                ConditionExpression: 'attribute_not_exists(transactionId)'
              }
            },
            {
              Update: {
                TableName: 'Clients',
                Key: { id: clientId },
                UpdateExpression: 'ADD walletBalance :points',
                ExpressionAttributeValues: { ':points': refundPoints }
              }
            }
          ]
        }))

        logEvent({
          eventName: EventName.WalletCredited,
          actorType: 'system',
          clientId,
          requestId,
          source: 'api/requests/[requestId]/cancel',
          metadata: { points: refundPoints, reason: 'cancellation_refund' }
        })
      } catch (err) {
        // Only a failed condition on the ledger row (index 0) means the
        // deterministic id is taken and the credit already landed. A cancelled
        // transaction can also be a conflict with another write to the Clients
        // row (a rating, a merge) — then nothing was credited, and the request is
        // already CANCELLED so no retry will come. Log it for a manual top-up.
        const alreadyCredited =
          err instanceof TransactionCanceledException &&
          err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
        if (!alreadyCredited) {
          console.error(
            `[cancel] wallet credit of ${refundPoints} points NOT applied for ${requestId} (client ${clientId}) — top up manually:`,
            err
          )
        }
      }
    }

    // Which garage loses the booking, for the alerts, the log and its email.
    // Rows from before `acceptedGarageId` existed only know it via the offer.
    let garageId =
      typeof serviceRequest.acceptedGarageId === 'string' ? serviceRequest.acceptedGarageId : undefined
    if (!garageId && acceptedOfferId) {
      const acceptedOffer = (await dynamoDB.send(
        new GetCommand({ TableName: 'Offers', Key: { id: acceptedOfferId } })
      )).Item
      garageId = typeof acceptedOffer?.garageId === 'string' ? acceptedOffer.garageId : undefined
    }

    // A cancelled appointment drops out of both sides' standing alerts.
    invalidateUnread('client', clientId)
    if (garageId) invalidateUnread('garage', garageId)

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
    // Sent after the request is CANCELLED, when no garage holds the job any more,
    // so the winner-only rule allows the first name and nothing else.
    const clientName = (clientRes.Item && quotingFirstName(clientRes.Item)) || 'πελάτης'
    // A deactivated garage keeps its bookings but is told nothing about clients.
    const garageEmail = garageRes.Item?.isActive === true ? (garageRes.Item.email as string | undefined) : undefined
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
