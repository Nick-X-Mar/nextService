'use client'

import { useCallback, useRef, useState } from 'react'

const DEFAULT_KEY = '__default__'

/**
 * Tracks "this button is working" state so every async action can show a
 * spinner and refuse double-clicks, without each component hand-rolling its own
 * `isLoading` boolean.
 *
 * One button per component:
 *
 *   const { run, isPending } = useAsyncTask()
 *   <button onClick={() => run(handleSave)} disabled={isPending()}>
 *     {isPending() ? <Spinner /> : <Icon name="save" size="sm" />}
 *   </button>
 *
 * Several buttons, or one button per row in a list — pass a key so only the
 * clicked one spins:
 *
 *   <button onClick={() => run(`accept-${offer.id}`, () => acceptOffer(offer.id))}
 *           disabled={isPending(`accept-${offer.id}`)}>
 *
 * Keys are independent: a slow refresh doesn't freeze an unrelated save. Use
 * `anyPending` when a whole form should lock down instead.
 */
export function useAsyncTask() {
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  // Mirrors `pendingKeys` synchronously — state updates are batched, so a
  // double-click within the same tick would otherwise slip past the guard.
  const inFlight = useRef<Set<string>>(new Set())

  // Accepts sync callbacks too, so context helpers typed `() => void` (which
  // are async underneath, like AuthContext's logout) can be passed straight in.
  const run = useCallback(
    async <T,>(
      keyOrFn: string | (() => T | Promise<T>),
      maybeFn?: () => T | Promise<T>
    ): Promise<T | undefined> => {
      const key = typeof keyOrFn === 'string' ? keyOrFn : DEFAULT_KEY
      const fn = typeof keyOrFn === 'string' ? maybeFn : keyOrFn
      if (!fn) return undefined
      if (inFlight.current.has(key)) return undefined

      inFlight.current.add(key)
      setPendingKeys((keys) => [...keys, key])
      try {
        return await fn()
      } finally {
        inFlight.current.delete(key)
        setPendingKeys((keys) => keys.filter((k) => k !== key))
      }
    },
    []
  )

  const isPending = useCallback(
    (key: string = DEFAULT_KEY) => pendingKeys.includes(key),
    [pendingKeys]
  )

  return { run, isPending, anyPending: pendingKeys.length > 0 }
}
