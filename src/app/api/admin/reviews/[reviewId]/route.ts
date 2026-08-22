import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureReviewsTable, REVIEWS_TABLE_NAME } from '@/utils/ensureReviewsTable'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import type { Review } from '@/types/reviews'

/**
 * Hide or restore a review.
 *
 * Hiding takes it out of the public average as well as off the page: the
 * rolling `ratingSum`/`ratingCount` on the party is adjusted by the same
 * amount, so a review removed for abuse stops influencing the score. Restoring
 * puts it back. The row itself is never deleted — moderation decisions need to
 * stay auditable.
 */
async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { reviewId } = await params
    const body = await request.json()
    const next = body.status === 'hidden' ? 'hidden' : 'published'
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : ''

    await ensureReviewsTable()
    const existing = await dynamoDB.send(
      new GetCommand({ TableName: REVIEWS_TABLE_NAME, Key: { reviewId } })
    )
    const review = existing.Item as Review | undefined
    if (!review) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })

    if (review.status === next) {
      return NextResponse.json({ success: true, review })
    }

    const now = new Date().toISOString()
    await dynamoDB.send(
      new UpdateCommand({
        TableName: REVIEWS_TABLE_NAME,
        Key: { reviewId },
        UpdateExpression:
          'SET #status = :status, moderatedBy = :by, moderatedAt = :now, moderationReason = :reason, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': next,
          ':by': admin.email,
          ':now': now,
          ':reason': reason,
        },
      })
    )

    // Keep the aggregate honest about what is actually on display.
    const table = review.direction === 'client_to_garage' ? 'Garages' : 'Clients'
    const subjectId = review.direction === 'client_to_garage' ? review.garageId : review.clientId
    const delta = next === 'hidden' ? -1 : 1

    try {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: table,
          Key: { id: subjectId },
          UpdateExpression: 'ADD ratingCount :count, ratingSum :sum SET updatedAt = :now',
          ExpressionAttributeValues: {
            ':count': delta,
            ':sum': delta * review.rating,
            ':now': now,
          },
          ConditionExpression: 'attribute_exists(id)',
        })
      )
    } catch (err) {
      // The moderation decision stands regardless; the aggregate can be
      // rebuilt from the reviews themselves.
      console.error('[admin-reviews] aggregate adjust failed:', err)
    }

    return NextResponse.json({ success: true, status: next })
  } catch (error) {
    console.error('Admin review moderation error:', error)
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 })
  }
}

export const PATCH = withMetrics(_PATCH)
