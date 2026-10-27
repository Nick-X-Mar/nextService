import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureReviewsTable, REVIEWS_TABLE_NAME } from '@/utils/ensureReviewsTable'
import { REVIEW_WINDOW_DAYS, type ReviewDirection } from '@/types/reviews'

/** Reviews are only invited for a while after the job closes. */
export function withinReviewWindow(completedAt: unknown, now: number = Date.now()): boolean {
  if (typeof completedAt !== 'string') return false
  const at = new Date(completedAt).getTime()
  return !isNaN(at) && now - at < REVIEW_WINDOW_DAYS * 86_400_000
}

/**
 * Which of these requests already carry a review in the given direction.
 *
 * Reviews are keyed `<requestId>#<direction>`, so this is a batch of point
 * lookups rather than a query per request — it runs on every notification
 * poll, for every open tab.
 *
 * On failure it reports every request as reviewed: that suppresses the nudge
 * rather than the caller, and an extra prompt is worse than a missing one.
 */
export async function reviewedRequestIds(
  requestIds: string[],
  direction: ReviewDirection
): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set()
  try {
    await ensureReviewsTable()
    const found = new Set<string>()
    // BatchGet caps at 100 keys per call.
    for (let i = 0; i < requestIds.length; i += 100) {
      let keys: Record<string, unknown>[] = requestIds
        .slice(i, i + 100)
        .map((id) => ({ reviewId: `${id}#${direction}` }))
      for (let attempt = 0; keys.length > 0 && attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt))
        const res = await dynamoDB.send(new BatchGetCommand({
          RequestItems: {
            // Consistent: the review route invalidates the summary the moment
            // it writes, and the recompute that follows must see that write —
            // an eventually consistent read could miss it and cache the stale
            // "αξιολόγησε" prompt for the whole TTL.
            [REVIEWS_TABLE_NAME]: { Keys: keys, ProjectionExpression: 'requestId', ConsistentRead: true },
          },
        }))
        for (const item of res.Responses?.[REVIEWS_TABLE_NAME] ?? []) {
          if (typeof item.requestId === 'string') found.add(item.requestId)
        }
        keys = (res.UnprocessedKeys?.[REVIEWS_TABLE_NAME]?.Keys ?? []) as Record<string, unknown>[]
      }
      // Still unprocessed: treat as reviewed, for the same reason as a failure.
      for (const key of keys) found.add(String(key.reviewId).split('#')[0])
    }
    return found
  } catch (err) {
    console.error('[reviews] lookup failed:', err)
    return new Set(requestIds)
  }
}
