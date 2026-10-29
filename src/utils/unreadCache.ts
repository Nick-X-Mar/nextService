import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { collectAll } from '@/utils/pagination'
import { createTtlCache } from './ttlCache'
import { ServiceRequestStatus } from '@/types/statuses'
import type { NotificationSummary } from '@/types/alerts'
import { TABLES } from '@/lib/tables'

/**
 * Caches the per-user notification summary, which is expensive to build (a
 * query per request for clients, a garage-thread lookup plus offer joins for
 * garages).
 *
 * Lives in its own module so the routes that change what it counts — mark-read,
 * opening an offer — can drop the entry immediately. Without that the badge
 * would keep showing a number the user has just cleared. The TTL is the bound
 * for everything nobody invalidates: on Amplify SSR each container holds its own
 * cache, so an invalidate only reliably clears the instance that served the
 * request, and some changes (a request arriving in the market) invalidate no
 * one.
 *
 * It must outlast the app shell's poll interval (NotificationsContext, 30s), or
 * the cache never answers a poll and is pure overhead: at 45s every other poll
 * of an open tab — and every focus or refresh in between — is served from it.
 * What a cached summary cannot know (requests that arrived or left since) the
 * browser already holds from the realtime channel and merges back in.
 */
export const unreadCache = createTtlCache<NotificationSummary>(45_000)

export function unreadCacheKey(userType: 'client' | 'garage', userId: string): string {
  return `${userType}:${userId}`
}

export function invalidateUnread(userType: 'client' | 'garage', userId: string): void {
  unreadCache.invalidate(unreadCacheKey(userType, userId))
}

export interface PendingMarket {
  ids: string[]
  /** When the query started — anything created after it may be missing. */
  asOf: string
}

/**
 * Every request currently open for offers, shared by every garage's summary.
 *
 * The market is the same list for every garage — only "which of these has this
 * garage already answered" differs, and that comes from the garage's own
 * offers. StatusIndex projects whole items, so `ProjectionExpression: 'id'`
 * trims the response but not the read: each garage's summary used to pay for
 * reading every pending request in full. Shared, it is read once per window per
 * instance however many garages are polling.
 *
 * Staleness is bounded by the window and covered from both ends: the summary
 * reports `marketAsOf`, and the browser keeps any request the realtime channel
 * delivered after it (and drops any it saw leave).
 */
const marketCache = createTtlCache<PendingMarket>(15_000)

export function pendingMarket(): Promise<PendingMarket> {
  return marketCache.getOrCompute('pending', async () => {
    const asOf = new Date().toISOString()
    const rows = await collectAll<{ id?: string }>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: TABLES.ServiceRequests,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': ServiceRequestStatus.PENDING },
          ProjectionExpression: 'id',
          ExclusiveStartKey: startKey,
        })),
      'pending market'
    )
    return { ids: rows.map((r) => r.id).filter((id): id is string => !!id), asOf }
  })
}
