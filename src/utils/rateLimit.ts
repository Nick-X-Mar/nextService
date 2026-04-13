/**
 * Shared in-memory rate limiting utility.
 * In production with multiple instances, replace with Redis-backed rate limiting.
 */

const stores = new Map<string, Map<string, { count: number; resetTime: number }>>()

function getStore(prefix: string): Map<string, { count: number; resetTime: number }> {
  let store = stores.get(prefix)
  if (!store) {
    store = new Map()
    stores.set(prefix, store)
  }
  return store
}

export function createRateLimiter(prefix: string, maxAttempts: number, windowMs: number = 3600000) {
  // In development, use much higher limits to allow E2E testing
  const isDev = process.env.NODE_ENV === 'development'
  const effectiveMax = isDev ? maxAttempts * 100 : maxAttempts
  const store = getStore(prefix)

  return function checkRateLimit(identifier: string): boolean {
    const now = Date.now()
    const key = `${prefix}:${identifier}`
    const current = store.get(key)

    if (!current || now > current.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }
    if (current.count >= effectiveMax) return false
    current.count++
    return true
  }
}
