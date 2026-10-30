import { createHash } from 'crypto'
import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { collectAll } from '@/utils/pagination'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { TABLES } from '@/lib/tables'
import { invalidatePlatformExamples } from '@/app/api/price-estimation/platformExamples'

/**
 * The writes every path that files an offer must go through — the garage's own
 * POST /api/offers and the admin's "assign to garage" alike. Two copies of this
 * is how the admin path ended up minting random ids with a bare Put, skipping
 * the one-offer-per-garage rule and the check that the request still takes offers.
 */

/** Far above any real repair quote, low enough to catch a slipped finger. */
export const MAX_OFFER_AMOUNT = 50_000
/** The offer form allows weekdays up to two months out — about 45. */
export const MAX_AVAILABILITY_DATES = 60

export const REQUEST_NOT_OPEN = {
  success: false,
  code: 'REQUEST_NOT_OPEN',
  error: 'Το αίτημα δεν δέχεται πλέον προσφορές — ο πελάτης το ακύρωσε ή έκλεισε ραντεβού.',
}

// A concurrent write touched the same rows and DynamoDB cancelled this one
// without any condition failing — nothing is wrong, it just has to be resent.
export const WRITE_CONFLICT = {
  success: false,
  code: 'WRITE_CONFLICT',
  error: 'Η προσφορά άλλαξε την ίδια στιγμή από αλλού. Δοκιμάστε ξανά.',
}

/** Euros, rounded to the cent, or null when it is not a sane quote. */
export function parseOfferAmount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw <= 0 || raw > MAX_OFFER_AMOUNT) return null
  return Math.round(raw * 100) / 100
}

/**
 * One garage, one offer per request — the id is derived from the pair, so the
 * `attribute_not_exists(id)` on the put is what enforces it, even for two
 * submits racing each other.
 */
export function offerIdFor(serviceRequestId: string, garageId: string): string {
  const digest = createHash('sha256').update(`${serviceRequestId}\n${garageId}`).digest('hex')
  return `offer_${digest.slice(0, 32)}`
}

/**
 * Offers created before ids were deterministic carry a random id, so the put
 * condition cannot see them. Those rows are old enough for the index to have
 * caught up, which is why a query is good enough for them.
 */
async function findLegacyOffer(serviceRequestId: string, garageId: string) {
  const offers = await collectAll<Record<string, unknown>>(
    (startKey) =>
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.Offers,
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :serviceRequestId',
        FilterExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':serviceRequestId': serviceRequestId, ':garageId': garageId },
        ExclusiveStartKey: startKey,
      })),
    `offers by ${garageId} on ${serviceRequestId}`
  )
  return offers[0]
}

/**
 * Which item of a transaction failed its condition, or null when none did (a
 * conflict with a concurrent write) or DynamoDB did not say — the caller then
 * re-reads to find out.
 */
export function failedTransactItem(error: unknown): number | null {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return null
  const reasons = (error as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons
  const index = reasons?.findIndex((r) => r?.Code === 'ConditionalCheckFailed') ?? -1
  return index >= 0 ? index : null
}

export function isTransactionCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'TransactionCanceledException'
}

export async function isRequestOpen(serviceRequestId: string): Promise<boolean> {
  const res = await dynamoDB.send(new GetCommand({
    TableName: TABLES.ServiceRequests,
    Key: { id: serviceRequestId },
    ProjectionExpression: '#status',
    ExpressionAttributeNames: { '#status': 'status' },
    ConsistentRead: true,
  }))
  return res.Item?.status === ServiceRequestStatus.PENDING
}

/** The ConditionCheck that ties an offer write to the request still taking offers. */
export function requestStillOpen(serviceRequestId: string) {
  return {
    ConditionCheck: {
      TableName: TABLES.ServiceRequests,
      Key: { id: serviceRequestId },
      ConditionExpression: '#status = :open',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':open': ServiceRequestStatus.PENDING },
    },
  }
}

export type NewOfferOutcome =
  | { ok: true }
  | { ok: false; code: 'OFFER_EXISTS'; offerId: string }
  | { ok: false; code: 'REQUEST_NOT_OPEN' }
  | { ok: false; code: 'WRITE_CONFLICT' }

/**
 * Writes a new offer, built with `offerIdFor`, only while its request still
 * takes offers and only if this garage has none on it yet.
 */
export async function putNewOffer(
  offer: Record<string, unknown> & { id: string; serviceRequestId: string; garageId: string }
): Promise<NewOfferOutcome> {
  const legacy = await findLegacyOffer(offer.serviceRequestId, offer.garageId)
  if (legacy) return { ok: false, code: 'OFFER_EXISTS', offerId: legacy.id as string }

  // The caller's read of the request is only a fast path: the client may book
  // another garage or cancel between that read and this write, so the write
  // itself carries the condition.
  try {
    await dynamoDB.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLES.Offers, Item: offer, ConditionExpression: 'attribute_not_exists(id)' } },
        requestStillOpen(offer.serviceRequestId),
      ],
    }))
  } catch (error) {
    if (!isTransactionCancelled(error)) throw error
    const failed = failedTransactItem(error)
    if (failed === 0) return { ok: false, code: 'OFFER_EXISTS', offerId: offer.id }
    if (failed === 1) return { ok: false, code: 'REQUEST_NOT_OPEN' }

    const [stored, open] = await Promise.all([
      dynamoDB.send(new GetCommand({ TableName: TABLES.Offers, Key: { id: offer.id }, ConsistentRead: true })),
      isRequestOpen(offer.serviceRequestId),
    ])
    if (stored.Item) return { ok: false, code: 'OFFER_EXISTS', offerId: offer.id }
    if (!open) return { ok: false, code: 'REQUEST_NOT_OPEN' }
    return { ok: false, code: 'WRITE_CONFLICT' }
  }

  invalidatePlatformExamples()
  await closeIfRequestMovedOn(offer.id, offer.serviceRequestId)
  return { ok: true }
}

/**
 * The offer committed while the request was open, but an acceptance or a
 * cancel may have committed right after it — and those find the offers to close
 * through ServiceRequestOffersIndex, which can lag a write by a moment and so
 * miss this one. Re-reading the request consistently closes most of that window
 * from this side; the garage screens also treat any offer on a request that is
 * no longer pending as closed, whatever its own status says.
 */
async function closeIfRequestMovedOn(offerId: string, serviceRequestId: string): Promise<void> {
  try {
    if (await isRequestOpen(serviceRequestId)) return
    await rejectPendingOffer(offerId, new Date().toISOString())
  } catch (err) {
    console.error(`[offers] could not re-check request ${serviceRequestId} after offer ${offerId}:`, err)
  }
}

/**
 * Closes one offer that lost — to another garage's acceptance or to the request
 * being cancelled. Conditional on it still being pending, so an offer the garage
 * already withdrew, or the accepted one, is never overwritten. Resolves to
 * whether it was this call that closed it.
 */
export async function rejectPendingOffer(offerId: string, updatedAt: string): Promise<boolean> {
  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLES.Offers,
      Key: { id: offerId },
      UpdateExpression: 'SET #status = :rejected, updatedAt = :updatedAt',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':rejected': OfferStatus.REJECTED,
        ':pending': OfferStatus.PENDING,
        ':updatedAt': updatedAt,
      },
    }))
    return true
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false
    throw err
  }
}

/**
 * Closes every pending offer on a request that just stopped taking them, except
 * `keepOfferId` (the one an acceptance booked). Returns the offers it closed.
 */
export async function rejectPendingOffersOn(
  serviceRequestId: string,
  updatedAt: string,
  keepOfferId?: string
): Promise<Record<string, unknown>[]> {
  const offers = await collectAll<Record<string, unknown>>(
    (startKey) =>
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.Offers,
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :serviceRequestId',
        ExpressionAttributeValues: { ':serviceRequestId': serviceRequestId },
        ExclusiveStartKey: startKey,
      })),
    `offers for request ${serviceRequestId}`
  )
  const candidates = offers.filter(
    (offer) => offer.id !== keepOfferId && offer.status === OfferStatus.PENDING
  )
  const outcomes = await Promise.allSettled(
    candidates.map((offer) => rejectPendingOffer(offer.id as string, updatedAt))
  )
  return candidates.filter((offer, i) => {
    const outcome = outcomes[i]
    if (outcome.status === 'fulfilled') return outcome.value
    console.error(`[offers] failed to reject offer ${offer.id}:`, outcome.reason)
    return false
  })
}
