import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'
import { invalidateUnread } from '@/utils/unreadCache'
import { ServiceRequestStatus } from '@/types/statuses'
import { createReview, DuplicateReviewError } from '@/utils/reviewService'
import {
  DEFAULT_VAT_RATE,
  isCompletionDue,
  splitVat,
  type CompletionOutcome,
} from '@/types/reviews'

/**
 * The garage confirms what happened after the appointment.
 *
 * This is the transition into COMPLETED, which nothing in the app performed
 * before: the state existed in the enum and in the admin's commission queries,
 * but no code ever wrote it, so the commission report was permanently empty.
 *
 * The garage declares what it actually charged, which is a different number
 * from `appointmentPrice` — that is only the quote. Commission is calculated
 * on the net figure derived here.
 *
 * Rating the client is optional and rides along in the same request, because
 * asking twice is how you get the first answer and not the second.
 */

const checkRate = createRateLimiter('request-complete', 30, 3600000)

const OUTCOMES: CompletionOutcome[] = ['completed', 'no_show', 'not_done']

/**
 * Which garage owns this appointment.
 *
 * Prefers the denormalised `acceptedGarageId`, falling back to the accepted
 * offer for rows written before that field existed.
 */
async function resolveAssignedGarage(
  serviceRequest: Record<string, unknown>
): Promise<string | null> {
  const direct = serviceRequest.acceptedGarageId
  if (typeof direct === 'string' && direct) return direct

  const offerId = serviceRequest.acceptedOfferId
  if (typeof offerId !== 'string' || !offerId) return null

  const offer = await dynamoDB.send(
    new GetCommand({
      TableName: 'Offers',
      Key: { id: offerId },
      ProjectionExpression: 'garageId',
    })
  )
  const garageId = offer.Item?.garageId
  return typeof garageId === 'string' ? garageId : null
}

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    if (!checkRate(garageId)) {
      return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις. Δοκιμάστε αργότερα.' }, { status: 429 })
    }

    const { requestId } = await params
    const body = await request.json()

    const outcome: CompletionOutcome = OUTCOMES.includes(body.outcome) ? body.outcome : 'completed'

    const res = await dynamoDB.send(
      new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
    )
    const serviceRequest = res.Item
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Το αίτημα δεν βρέθηκε' }, { status: 404 })
    }

    // Only the garage that actually got the job may close it.
    //
    // `acceptedGarageId` was added after the first appointments were booked,
    // so older rows carry only `acceptedOfferId`. Those appointments still show
    // up in the garage's list and still need closing — without this fallback
    // they render a "δήλωσε το" button that answers 403 forever.
    const assignedGarageId = await resolveAssignedGarage(serviceRequest)
    if (assignedGarageId !== garageId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση σε αυτό το αίτημα' }, { status: 403 })
    }
    if (serviceRequest.status !== ServiceRequestStatus.APPOINTMENT) {
      return NextResponse.json(
        { error: 'Το αίτημα δεν είναι σε κατάσταση ραντεβού.' },
        { status: 409 }
      )
    }
    // A job cannot be closed before its own appointment has finished.
    if (!isCompletionDue(serviceRequest.appointmentDate, serviceRequest.appointmentTime)) {
      return NextResponse.json(
        { error: 'Το ραντεβού δεν έχει ολοκληρωθεί ακόμη.' },
        { status: 409 }
      )
    }

    // Amounts only make sense when work was actually done.
    let amounts
    if (outcome === 'completed') {
      const declared = Number(body.amount)
      if (!Number.isFinite(declared) || declared <= 0) {
        return NextResponse.json(
          { error: 'Δήλωσε το ποσό που χρέωσες.' },
          { status: 400 }
        )
      }
      if (declared > 1_000_000) {
        return NextResponse.json({ error: 'Μη έγκυρο ποσό.' }, { status: 400 })
      }
      const enteredAs = body.vatIncluded === false ? 'net' : 'gross'
      const vatRate = Number.isFinite(Number(body.vatRate))
        ? Math.max(0, Math.min(100, Number(body.vatRate)))
        : DEFAULT_VAT_RATE
      amounts = splitVat(declared, enteredAs, vatRate)
    }

    const now = new Date().toISOString()
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000).trim() : ''

    try {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: 'ServiceRequests',
          Key: { id: requestId },
          UpdateExpression:
            'SET #status = :completed, completedAt = :now, completedBy = :by, ' +
            // Backfill on the way past, so the row stops needing the fallback.
            'acceptedGarageId = :garage, ' +
            'completionOutcome = :outcome, updatedAt = :now' +
            (amounts ? ', finalAmounts = :amounts' : '') +
            (notes ? ', completionNotes = :notes' : ''),
          // Re-checked at write time: two tabs, or a retry after a slow
          // response, must not both succeed.
          ConditionExpression: '#status = :appointment',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':completed': ServiceRequestStatus.COMPLETED,
            ':appointment': ServiceRequestStatus.APPOINTMENT,
            ':now': now,
            ':by': 'garage',
            ':garage': garageId,
            ':outcome': outcome,
            ...(amounts ? { ':amounts': amounts } : {}),
            ...(notes ? { ':notes': notes } : {}),
          },
        })
      )
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return NextResponse.json({ error: 'Το αίτημα έχει ήδη κλείσει.' }, { status: 409 })
      }
      throw err
    }

    // Optional: the garage's review of the client, submitted in the same step.
    let reviewError: string | undefined
    if (body.rating) {
      try {
        await createReview({
          requestId,
          garageId,
          clientId: serviceRequest.clientId,
          direction: 'garage_to_client',
          rating: Number(body.rating),
          comment: body.comment,
          tags: body.tags,
        })
      } catch (err) {
        // The job is closed either way; a rejected review must not roll that
        // back or make the garage think the completion failed.
        reviewError = err instanceof DuplicateReviewError ? err.message : 'Η αξιολόγηση δεν καταχωρήθηκε.'
        console.error('[complete] review failed:', err)
      }
    }

    logEvent({
      eventName: EventName.ServiceCompleted,
      actorType: 'garage',
      actorId: garageId,
      requestId,
      garageId,
      clientId: serviceRequest.clientId,
      metadata: {
        outcome,
        ...(amounts ? { net: amounts.net, gross: amounts.gross, vatRate: amounts.vatRate } : {}),
        quotedPrice: serviceRequest.appointmentPrice,
      },
    })

    // Both sides' standing alerts change the moment this lands: the garage's
    // "έγινε η επισκευή;" prompt clears and the client's review prompt opens.
    // Without this they would lag by the cache TTL.
    invalidateUnread('garage', garageId)
    invalidateUnread('client', serviceRequest.clientId as string)

    void broadcastRequestUpdate(requestId, ServiceRequestStatus.COMPLETED, 'garage_completed')

    return NextResponse.json({
      success: true,
      completedAt: now,
      outcome,
      amounts: amounts ?? null,
      ...(reviewError ? { reviewError } : {}),
    })
  } catch (error) {
    console.error('Error completing request:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά την ολοκλήρωση' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
