/**
 * Tiny in-memory TTL cache for expensive read-only computations (analytics
 * aggregations etc). Per-process, per-container — so in serverless (Amplify
 * SSR) each instance has its own cache and hit rate is not 100%, but it
 * still cuts repeat-load cost meaningfully.
 *
 * Not a general purpose cache: no LRU eviction. The intended usage is a small,
 * bounded set of keys (e.g. one per admin date range, one per signed-in user),
 * so memory growth is predictable.
 *
 * `invalidate` is a correctness tool, not just a memory one: callers drop a key
 * right after a write that changes what it holds (see unreadCache). So a
 * computation that was already running when the key was invalidated read the
 * world from before that write, and must neither be stored nor handed to a
 * caller who arrives after it. Each key carries a generation that `invalidate`
 * bumps; a computation remembers the generation it started under, and only
 * stores its result if nothing has moved since.
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
  /** Clear a single key, including any computation for it already in flight. */
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
  // Bumped by every invalidate. Only keys that were ever invalidated have an
  // entry, which is the same bounded set of keys the store holds. `clear`
  // bumps the epoch instead, which moves every key at once.
  const generations = new Map<string, number>()
  let epoch = 0
  const generationOf = (key: string) => `${epoch}:${generations.get(key) ?? 0}`

  return {
    async getOrCompute(key, compute) {
      const now = Date.now()
      const hit = store.get(key)
      if (hit && hit.expiresAt > now) {
        return hit.value
      }

      const pending = inFlight.get(key)
      if (pending) return pending

      const startedAt = generationOf(key)
      // Chained rather than an async IIFE so the cleanup below always runs
      // after `promise` is assigned, even if `compute` throws synchronously.
      const promise: Promise<T> = Promise.resolve()
        .then(compute)
        .then((value) => {
          if (generationOf(key) === startedAt) {
            store.set(key, { value, expiresAt: Date.now() + ttlMs })
          }
          return value
        })
        .finally(() => {
          // An invalidate may already have replaced this computation with a
          // newer one; that one is not ours to remove.
          if (inFlight.get(key) === promise) inFlight.delete(key)
        })

      inFlight.set(key, promise)
      return promise
    },
    invalidate(key) {
      store.delete(key)
      // Callers arriving from here on start a fresh computation instead of
      // joining one that predates the change.
      inFlight.delete(key)
      generations.set(key, (generations.get(key) ?? 0) + 1)
    },
    clear() {
      store.clear()
      inFlight.clear()
      epoch++
    },
    size() {
      return store.size
    }
  }
}
