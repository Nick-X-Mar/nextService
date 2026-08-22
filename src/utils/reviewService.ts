import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureReviewsTable, REVIEWS_TABLE_NAME } from '@/utils/ensureReviewsTable'
import {
  CLIENT_REVIEW_TAGS,
  GARAGE_REVIEW_TAGS,
  REVIEW_REVEAL_DAYS,
  type Review,
  type ReviewDirection,
} from '@/types/reviews'

/**
 * Reviews, in both directions, plus the rolling rating on each party.
 *
 * Two rules shape this file.
 *
 * **One review per job per direction.** The row id is derived from the request
 * and the direction rather than random, so a duplicate submission collides on
 * the partition key and a conditional write rejects it. A retry, a double-tap
 * or two tabs cannot produce two ratings for the same job.
 *
 * **Neither side sees the other's review until both have written**, or until
 * the reveal window passes. Publishing the first review immediately would let
 * whoever writes second answer the one they can already read, which is how
 * review systems end up recording arguments rather than experiences.
 */

/** Deterministic id: this is what makes a second submission impossible. */
function reviewId(requestId: string, direction: ReviewDirection): string {
  return `${requestId}#${direction}`
}

function revealDeadline(from: Date): string {
  return new Date(from.getTime() + REVIEW_REVEAL_DAYS * 86_400_000).toISOString()
}

/** Every review written about a job, in both directions. */
export async function reviewsForRequest(requestId: string): Promise<Review[]> {
  await ensureReviewsTable()
  const res = await dynamoDB.send(
    new QueryCommand({
      TableName: REVIEWS_TABLE_NAME,
      IndexName: 'RequestReviewsIndex',
      KeyConditionExpression: 'requestId = :requestId',
      ExpressionAttributeValues: { ':requestId': requestId },
    })
  )
  return (res.Items || []) as Review[]
}

export async function reviewForRequest(
  requestId: string,
  direction: ReviewDirection
): Promise<Review | null> {
  await ensureReviewsTable()
  const res = await dynamoDB.send(
    new GetCommand({
      TableName: REVIEWS_TABLE_NAME,
      Key: { reviewId: reviewId(requestId, direction) },
    })
  )
  return (res.Item as Review | undefined) ?? null
}

/** Keeps submitted tags inside the closed set the UI offers. */
function sanitizeTags(tags: unknown, direction: ReviewDirection): string[] {
  const allowed: readonly string[] =
    direction === 'client_to_garage' ? GARAGE_REVIEW_TAGS : CLIENT_REVIEW_TAGS
  if (!Array.isArray(tags)) return []
  return tags.filter((tag): tag is string => typeof tag === 'string' && allowed.includes(tag))
}

export class DuplicateReviewError extends Error {}

/**
 * Adds a rating to a party's rolling total.
 *
 * `ADD` is atomic server-side, so two reviews landing at once cannot lose one
 * another — which a read-modify-write would.
 */
async function addToAggregate(table: 'Garages' | 'Clients', id: string, rating: number) {
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: table,
        Key: { id },
        UpdateExpression: 'ADD ratingCount :one, ratingSum :rating SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':one': 1,
          ':rating': rating,
          ':now': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_exists(id)',
      })
    )
  } catch (err) {
    // A missing party should not undo a review that is already stored — the
    // aggregate is derivable from the reviews themselves.
    if (err instanceof ConditionalCheckFailedException) {
      console.warn(`[reviews] ${table} ${id} not found while updating rating aggregate`)
      return
    }
    throw err
  }
}

/**
 * Stores one review and, if it is the second on this job, reveals both.
 *
 * Throws `DuplicateReviewError` when this side has already reviewed.
 */
export async function createReview(input: {
  requestId: string
  garageId: string
  clientId: string
  direction: ReviewDirection
  rating: number
  comment?: string
  tags?: unknown
}): Promise<Review> {
  await ensureReviewsTable()

  const rating = Math.round(Number(input.rating))
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Η βαθμολογία πρέπει να είναι από 1 έως 5.')
  }

  const now = new Date()
  const review: Review = {
    reviewId: reviewId(input.requestId, input.direction),
    requestId: input.requestId,
    garageId: input.garageId,
    clientId: input.clientId,
    direction: input.direction,
    rating,
    ...(input.comment ? { comment: String(input.comment).slice(0, 2000).trim() } : {}),
    tags: sanitizeTags(input.tags, input.direction),
    status: 'published',
    revealAt: revealDeadline(now),
    createdAt: now.toISOString(),
  }

  try {
    await dynamoDB.send(
      new PutCommand({
        TableName: REVIEWS_TABLE_NAME,
        Item: review,
        ConditionExpression: 'attribute_not_exists(reviewId)',
      })
    )
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new DuplicateReviewError('Έχεις ήδη αξιολογήσει αυτή την εργασία.')
    }
    throw err
  }

  if (input.direction === 'client_to_garage') {
    await addToAggregate('Garages', input.garageId, rating)
  } else {
    await addToAggregate('Clients', input.clientId, rating)
  }

  // Both sides have now written, so neither can be influenced by the other.
  const counterpart =
    input.direction === 'client_to_garage' ? 'garage_to_client' : 'client_to_garage'
  const other = await reviewForRequest(input.requestId, counterpart)
  if (other) {
    const revealAt = now.toISOString()
    await Promise.all(
      [review.reviewId, other.reviewId].map((id) =>
        dynamoDB.send(
          new UpdateCommand({
            TableName: REVIEWS_TABLE_NAME,
            Key: { reviewId: id },
            UpdateExpression: 'SET revealAt = :now',
            ExpressionAttributeValues: { ':now': revealAt },
          })
        )
      )
    )
    review.revealAt = revealAt
  }

  return review
}

/**
 * Whether `viewer` may read this review yet.
 *
 * Its author always can — it is their own words. Everyone else waits for the
 * reveal, and a hidden review is only ever visible to its author.
 */
export function isReviewVisibleTo(
  review: Review,
  viewer: 'author' | 'counterparty',
  now: Date = new Date()
): boolean {
  if (viewer === 'author') return true
  if (review.status !== 'published') return false
  const reveal = new Date(review.revealAt)
  return !isNaN(reveal.getTime()) && now.getTime() >= reveal.getTime()
}

/** Published reviews for a garage, newest first. */
export async function reviewsForGarage(garageId: string, limit = 20): Promise<Review[]> {
  await ensureReviewsTable()
  const res = await dynamoDB.send(
    new QueryCommand({
      TableName: REVIEWS_TABLE_NAME,
      IndexName: 'GarageReviewsIndex',
      KeyConditionExpression: 'garageId = :garageId',
      FilterExpression: '#direction = :direction AND #status = :published',
      ExpressionAttributeNames: { '#direction': 'direction', '#status': 'status' },
      ExpressionAttributeValues: {
        ':garageId': garageId,
        ':direction': 'client_to_garage',
        ':published': 'published',
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  )
  return (res.Items || []) as Review[]
}
