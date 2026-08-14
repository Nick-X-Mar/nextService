import { createTtlCache } from './ttlCache'
import type { NotificationSummary } from '@/types/alerts'

/**
 * Caches the per-user notification summary, which is expensive to build (a
 * query per request for clients, a garage-thread lookup plus offer joins for
 * garages).
 *
 * Lives in its own module so the routes that change what it counts — mark-read,
 * opening an offer — can drop the entry immediately. Without that the badge
 * would keep showing a number the user has just cleared. The TTL is the real
 * correctness bound: on Amplify SSR each container holds its own cache, so an
 * invalidate only reliably clears the instance that served the request. Keep the
 * window short enough that a missed invalidate is a brief lag, never a stuck badge.
 */
export const unreadCache = createTtlCache<NotificationSummary>(20_000)

export function unreadCacheKey(userType: 'client' | 'garage', userId: string): string {
  return `${userType}:${userId}`
}

export function invalidateUnread(userType: 'client' | 'garage', userId: string): void {
  unreadCache.invalidate(unreadCacheKey(userType, userId))
}
