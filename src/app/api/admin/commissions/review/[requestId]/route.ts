import { NextRequest, NextResponse } from 'next/server'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { ServiceRequestStatus } from '@/types/statuses'
import type { OutcomeReview } from '@/lib/commission-basis'

/**
 * PUT /api/admin/commissions/review/[requestId]
 * Body: { decision: 'confirmed' | 'rejected', note?: string }
 *
 * The admin's verdict on a job a garage closed as "the client did not come" or
 * "the work was not done", after checking with the client:
 *   confirmed — it did not happen; no commission.
 *   rejected  — the client says it did; billed on the agreed price.
 * Can be changed later; the admin and the time are recorded with it.
 */
async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    const body = await request.json().catch(() => null)
    const decision = body && typeof body === 'object' ? (body as { decision?: unknown }).decision : undefined
    if (decision !== 'confirmed' && decision !== 'rejected') {
      return NextResponse.json({ error: 'Η απόφαση πρέπει να είναι confirmed ή rejected' }, { status: 400 })
    }
    const rawNote = (body as { note?: unknown }).note
    const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 1000) : ''

    const review: OutcomeReview = {
      status: decision,
      reviewedAt: new Date().toISOString(),
      reviewedBy: request.headers.get('x-admin-email') || 'admin',
      ...(note ? { note } : {}),
    }

    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: 'ServiceRequests',
        Key: { id: requestId },
        UpdateExpression: 'SET outcomeReview = :review',
        // Only a job closed as not having happened has anything to review.
        ConditionExpression: '#s = :completed AND completionOutcome IN (:noShow, :notDone)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':review': review,
          ':completed': ServiceRequestStatus.COMPLETED,
          ':noShow': 'no_show',
          ':notDone': 'not_done',
        },
      }))
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return NextResponse.json(
          { error: 'Η εργασία δεν έχει δηλωθεί ως «δεν έγινε»' },
          { status: 409 }
        )
      }
      throw err
    }

    await logEvent({
      eventName: EventName.CommissionOutcomeReviewed,
      actorType: 'admin',
      actorId: request.headers.get('x-admin-id') || 'admin',
      requestId,
      source: 'admin/commissions',
      metadata: { decision },
    })

    return NextResponse.json({ success: true, outcomeReview: review })
  } catch (error) {
    console.error('Commission outcome review error:', error)
    return NextResponse.json({ error: 'Failed to save the review' }, { status: 500 })
  }
}

export const PUT = withMetrics(_PUT)
