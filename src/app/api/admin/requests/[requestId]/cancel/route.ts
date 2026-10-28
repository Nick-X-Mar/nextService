import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'
import { invalidateUnread } from '@/utils/unreadCache'
import { rejectPendingOffersOn } from '@/app/api/offers/offerWrites'

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    // Verify request exists
    const reqResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    const sr = reqResult.Item
    if (!sr) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (sr.status === ServiceRequestStatus.CANCELLED) {
      return NextResponse.json({ error: 'Το αίτημα έχει ήδη ακυρωθεί.' }, { status: 409 })
    }
    // A closed job carries the garage's declared amount, its commission and
    // both reviews; cancelling it would erase all three after the fact.
    if (sr.status === ServiceRequestStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Το αίτημα έχει ολοκληρωθεί και δεν μπορεί να ακυρωθεί.' },
        { status: 409 }
      )
    }
    const cancellable: unknown[] = [
      ServiceRequestStatus.PENDING,
      ServiceRequestStatus.APPOINTMENT,
      ServiceRequestStatus.IN_PROGRESS,
    ]
    if (!cancellable.includes(sr.status)) {
      return NextResponse.json({ error: 'Το αίτημα δεν μπορεί να ακυρωθεί.' }, { status: 409 })
    }

    const now = new Date().toISOString()

    // A booked job's offer would otherwise stay ACCEPTED on a cancelled job,
    // and the garage would keep seeing it as booked — so the two change in one
    // transaction, never one without the other.
    const acceptedOfferId =
      sr.status !== ServiceRequestStatus.PENDING && typeof sr.acceptedOfferId === 'string'
        ? sr.acceptedOfferId
        : null

    // Conditional on the status just read, so a garage closing the job or the
    // client cancelling it in the meantime is never overwritten.
    try {
      await dynamoDB.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'ServiceRequests',
              Key: { id: requestId },
              UpdateExpression: 'SET #status = :status, cancelledAt = :now, updatedAt = :now',
              ConditionExpression: '#status = :previous',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':status': ServiceRequestStatus.CANCELLED,
                ':previous': sr.status,
                ':now': now
              }
            }
          },
          ...(acceptedOfferId
            ? [{
                Update: {
                  TableName: 'Offers',
                  Key: { id: acceptedOfferId },
                  UpdateExpression: 'SET #status = :rejected, updatedAt = :now',
                  // Exists and belongs to this request — an update on a missing
                  // key would quietly create a stray offer row instead.
                  ConditionExpression: 'attribute_exists(id) AND serviceRequestId = :requestId',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: {
                    ':rejected': OfferStatus.REJECTED,
                    ':requestId': requestId,
                    ':now': now
                  }
                }
              }]
            : [])
        ]
      }))
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const [requestReason, offerReason] = err.CancellationReasons ?? []
        if (offerReason?.Code === 'ConditionalCheckFailed' && requestReason?.Code !== 'ConditionalCheckFailed') {
          return NextResponse.json(
            { error: 'Η αποδεκτή προσφορά του αιτήματος λείπει ή ανήκει σε άλλο αίτημα — δεν έγινε καμία αλλαγή.' },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { error: 'Η κατάσταση του αιτήματος άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.' },
          { status: 409 }
        )
      }
      throw err
    }

    // Every quote still pending on it closes too — all of them when it was
    // still collecting quotes, any straggler the acceptance missed otherwise.
    // Left pending they would stay "Εκκρεμής" on each garage's list, and
    // editable, forever.
    const closedOffers = await rejectPendingOffersOn(requestId, now).catch((err) => {
      console.error(`[admin cancel] could not close the offers on ${requestId}:`, err)
      return []
    })

    const garageId = typeof sr.acceptedGarageId === 'string' ? sr.acceptedGarageId : undefined
    if (typeof sr.clientId === 'string') invalidateUnread('client', sr.clientId)
    if (garageId) invalidateUnread('garage', garageId)
    for (const offer of closedOffers) {
      if (typeof offer.garageId === 'string') invalidateUnread('garage', offer.garageId)
    }

    await logEvent({
      eventName: EventName.AppointmentCancelled,
      actorType: 'admin',
      actorId: 'admin',
      clientId: sr.clientId,
      garageId,
      requestId,
      source: 'api/admin/requests/[requestId]/cancel',
      metadata: { previousStatus: sr.status, cancelledByAdmin: true, offersClosed: closedOffers.length }
    })

    // Drop the card from any garage dashboard that's currently displaying it.
    await broadcastRequestUpdate(requestId, ServiceRequestStatus.CANCELLED, 'admin_cancelled')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}

export const PATCH = withMetrics(_PATCH)
