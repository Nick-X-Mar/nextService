'use client'

import { useCallback, useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/web-push-client'
import { useAsyncTask } from '@/hooks/useAsyncTask'

/**
 * This browser's push notifications for the signed-in account, for a switch
 * or a button: `state` is null until it has been read.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState | null>(null)
  const { run, isPending } = useAsyncTask()

  useEffect(() => {
    let live = true
    pushState().then((value) => { if (live) setState(value) }, () => { if (live) setState('unsupported') })
    return () => { live = false }
  }, [])

  // Straight from the tap, with nothing awaited first (see enablePush).
  const enable = useCallback(() => run(async () => {
    const next = await enablePush()
    setState(next)
    return next
  }), [run])
  const disable = useCallback(() => run(async () => setState(await disablePush())), [run])

  return { state, enable, disable, busy: isPending() }
}
