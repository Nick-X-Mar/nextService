import { NextRequest, NextResponse } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { ServiceRequestStatus } from '@/types/statuses'
import {
  createReview,
  DuplicateReviewError,
  isReviewVisibleTo,
  reviewsForRequest,
} from '@/utils/reviewService'
import {
  CLIENT_REVIEW_TAGS,
  GARAGE_REVIEW_TAGS,
  REVIEW_WINDOW_DAYS,
  type Review,
  type ReviewDirection,
} from '@/types/reviews'

/**
 * Both sides' reviews of one job.
 *
 * A caller only ever sees their own review plus the counterparty's once it has
 * been revealed — see `isReviewVisibleTo`. Until then the GET reports that the
 * other side has written *something*, without its content, so the UI can say
 * "θα εμφανιστεί όταν αξιολογήσεις κι εσύ" rather than pretending nothing is
 * there.
 */

const checkRate = createRateLimiter('request-review', 20, 3600000)

interface Party {
  direction: ReviewDirection
  clientId: string
  garageId: string
}

/** Who the caller is on this job, or a 403. */
async function resolveParty(
  request: NextRequest,
  requestId: string
): Promise<{ party: Party; serviceRequest: Record<string, unknown> } | NextResponse> {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const res = await dynamoDB.send(
    new GetCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
  )
  const serviceRequest = res.Item
  if (!serviceRequest) {
    return NextResponse.json({ error: 'Το αίτημα δεν βρέθηκε' }, { status: 404 })
  }

  const clientId = serviceRequest.clientId as string
  const garageId = serviceRequest.acceptedGarageId as string | undefined

  if (!garageId) {
    return NextResponse.json({ error: 'Το αίτημα δεν έχει ανατεθεί.' }, { status: 409 })
  }

  if (auth.userType === 'client') {
    if (auth.userId !== clientId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }
    return { party: { direction: 'client_to_garage', clientId, garageId }, serviceRequest }
  }

  if (auth.userId !== garageId) {
    return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
  }
  return { party: { direction: 'garage_to_client', clientId, garageId }, serviceRequest }
}

/** Strips a review down to what the counterparty is allowed to see. */
function publicShape(review: Review) {
  return {
    rating: review.rating,
    comment: review.comment ?? '',
    tags: review.tags ?? [],
    createdAt: review.createdAt,
  }
}

async function _GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await params
    const resolved = await resolveParty(request, requestId)
    if (resolved instanceof NextResponse) return resolved
    const { party, serviceRequest } = resolved

    const reviews = await reviewsForRequest(requestId)
    const mine = reviews.find((r) => r.direction === party.direction) ?? null
    const theirs = reviews.find((r) => r.direction !== party.direction) ?? null

    const revealed = theirs ? isReviewVisibleTo(theirs, 'counterparty') : false
    const completedAt = serviceRequest.completedAt as string | undefined
    const withinWindow = completedAt
      ? Date.now() - new Date(completedAt).getTime() < REVIEW_WINDOW_DAYS * 86_400_000
      : false

    return NextResponse.json({
      success: true,
      canReview:
        serviceRequest.status === ServiceRequestStatus.COMPLETED && !mine && withinWindow,
      mine: mine ? publicShape(mine) : null,
      // Content only once revealed; existence always, so the UI can explain
      // the wait instead of showing an empty state.
      theirsExists: !!theirs,
      theirs: theirs && revealed ? publicShape(theirs) : null,
      tags: party.direction === 'client_to_garage' ? GARAGE_REVIEW_TAGS : CLIENT_REVIEW_TAGS,
    }, {
      headers: { 'Cache-Control': 'no-store, private' },
    })
  } catch (error) {
    console.error('Error reading reviews:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά την ανάγνωση' }, { status: 500 })
  }
}

async function _POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await params
    const resolved = await resolveParty(request, requestId)
    if (resolved instanceof NextResponse) return resolved
    const { party, serviceRequest } = resolved

    if (!checkRate(`${party.direction}:${requestId}`)) {
      return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις.' }, { status: 429 })
    }

    // Reviews describe finished work, so the job has to be finished first.
    if (serviceRequest.status !== ServiceRequestStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Η εργασία δεν έχει ολοκληρωθεί ακόμη.' },
        { status: 409 }
      )
    }

    const completedAt = serviceRequest.completedAt as string | undefined
    if (
      completedAt &&
      Date.now() - new Date(completedAt).getTime() > REVIEW_WINDOW_DAYS * 86_400_000
    ) {
      return NextResponse.json(
        { error: `Η προθεσμία αξιολόγησης (${REVIEW_WINDOW_DAYS} ημέρες) έχει περάσει.` },
        { status: 409 }
      )
    }

    const body = await request.json()

    const review = await createReview({
      requestId,
      garageId: party.garageId,
      clientId: party.clientId,
      direction: party.direction,
      rating: Number(body.rating),
      comment: body.comment,
      tags: body.tags,
    })

    // This side's review nudge is now satisfied.
    invalidateUnread(
      party.direction === 'client_to_garage' ? 'client' : 'garage',
      party.direction === 'client_to_garage' ? party.clientId : party.garageId
    )

    logEvent({
      eventName: EventName.ServiceCompleted,
      actorType: party.direction === 'client_to_garage' ? 'client' : 'garage',
      actorId: party.direction === 'client_to_garage' ? party.clientId : party.garageId,
      requestId,
      clientId: party.clientId,
      garageId: party.garageId,
      metadata: { review: party.direction, rating: review.rating },
    })

    return NextResponse.json({ success: true, review: publicShape(review) })
  } catch (error) {
    if (error instanceof DuplicateReviewError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Σφάλμα κατά την αξιολόγηση'
    console.error('Error creating review:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const GET = withMetrics(_GET)
export const POST = withMetrics(_POST)
