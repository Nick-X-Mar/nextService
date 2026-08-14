'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { EMPTY_SUMMARY, type Alert, type NotificationSummary } from '@/types/alerts'

interface NotificationsState extends NotificationSummary {
  /** Re-poll now — e.g. right after opening a thread or an offer. */
  refresh: () => void
}

const NotificationsContext = createContext<NotificationsState>({
  ...EMPTY_SUMMARY,
  refresh: () => {},
})

// Slow enough to be invisible in cost (the summary is cached server-side for
// 20s anyway), fast enough that a banner appears while the user is still on the
// page. Real-time push would be better, but chat subscriptions are per-thread —
// there is no "anything for me" channel to listen on.
const POLL_INTERVAL_MS = 30_000

/**
 * One poll of everything waiting on the user, shared by every consumer.
 *
 * Sidebar and BottomNav are both mounted at all times (one is `hidden md:flex`,
 * the other `md:hidden`), and the banner stack is a third consumer — without
 * this provider that is three pollers asking the same question. Every new
 * notification must be added to the summary endpoint rather than fetched
 * separately, or the app grows a poller per badge.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { userType } = useAuth()
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY)
  const [tick, setTick] = useState(0)

  const enabled = userType === 'client' || userType === 'garage'
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) {
      setSummary(EMPTY_SUMMARY)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/notifications/summary/', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.success) return
        setSummary({
          threads: data.threads ?? 0,
          appointmentThreads: data.appointmentThreads ?? 0,
          openThreads: data.openThreads ?? 0,
          alerts: (data.alerts ?? []) as Alert[],
        })
      } catch {
        /* silent — a badge is not worth surfacing an error for */
      }
    }

    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    // Someone returning to the tab expects a current count straight away.
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, tick])

  return (
    <NotificationsContext.Provider value={{ ...summary, refresh }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext)
}
