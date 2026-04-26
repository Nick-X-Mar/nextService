/**
 * Tiny in-memory TTL cache for expensive read-only computations (analytics
 * aggregations etc). Per-process, per-container — so in serverless (Amplify
 * SSR) each instance has its own cache and hit rate is not 100%, but it
 * still cuts repeat-load cost meaningfully.
 *
 * Not a general purpose cache: no LRU eviction, no concurrency guards. The
 * intended usage is a small, bounded set of keys (e.g. one per admin date
 * range), so memory growth is predictable.
 *
 * Usage:
 *   const cache = createTtlCache<MyShape>(5 * 60_000)
 *   const data = await cache.getOrCompute(`my-key-${arg}`, () => compute())
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface TtlCache<T> {
  /** Returns the cached value if fresh, otherwise computes + stores it. */
  getOrCompute: (key: string, compute: () => Promise<T>) => Promise<T>
  /** Clear a single key. */
  invalidate: (key: string) => void
  /** Clear everything. */
  clear: () => void
  /** Inspect size — useful for tests. */
  size: () => number
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, CacheEntry<T>>()
  // Track in-flight computations so concurrent callers for the same key
  // share a single network round-trip rather than racing.
  const inFlight = new Map<string, Promise<T>>()

  return {
    async getOrCompute(key, compute) {
      const now = Date.now()
      const hit = store.get(key)
      if (hit && hit.expiresAt > now) {
        return hit.value
      }

      const pending = inFlight.get(key)
      if (pending) return pending

      const promise = (async () => {
        try {
          const value = await compute()
          store.set(key, { value, expiresAt: Date.now() + ttlMs })
          return value
        } finally {
          inFlight.delete(key)
        }
      })()

      inFlight.set(key, promise)
      return promise
    },
    invalidate(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    size() {
      return store.size
    }
  }
}
