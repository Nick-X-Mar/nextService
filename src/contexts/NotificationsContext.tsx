'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNewRequestNotifier } from '@/hooks/useNewRequestNotifier'
import { useRealtimeRequests, type BroadcastRequest, type RequestUpdatePayload } from '@/hooks/useRealtimeRequests'
import { useToast } from '@/hooks/useToast'
import { getCategoryText } from '@/utils/categoryLabels'
import { ServiceRequestStatus } from '@/types/statuses'
import { EMPTY_SUMMARY, type Alert, type NotificationSummary } from '@/types/alerts'

/** A request that landed while the garage was looking — feeds the header bell. */
export interface LiveRequest {
  id: string
  category: string
  vehicle?: string
  at: string
}

interface NotificationsState extends NotificationSummary {
  /** Requests broadcast since the garage last looked at the bell, newest first. */
  liveRequests: LiveRequest[]
  /** Empties the bell — call it when the garage opens the requests feed. */
  markRequestsSeen: () => void
  /** Re-poll now — e.g. right after opening a thread or an offer. */
  refresh: () => void
}

const NotificationsContext = createContext<NotificationsState>({
  ...EMPTY_SUMMARY,
  liveRequests: [],
  markRequestsSeen: () => {},
  refresh: () => {},
})

// Slow enough to be invisible in cost (the summary is cached server-side for
// 20s anyway), fast enough that a banner appears while the user is still on the
// page. New requests don't wait for it — those arrive over AppSync below — but
// everything else (unread messages, accepted offers) has no push channel.
const POLL_INTERVAL_MS = 30_000

/** Most recent arrivals kept in the bell; older ones live in the requests feed. */
const MAX_LIVE_REQUESTS = 8

/**
 * One poll of everything waiting on the user, shared by every consumer, plus the
 * live channel that makes a new request show up without a reload.
 *
 * Sidebar and BottomNav are both mounted at all times (one is `hidden md:flex`,
 * the other `md:hidden`), and the banner stack is a third consumer — without
 * this provider that is three pollers asking the same question. Every new
 * notification must be added to the summary endpoint rather than fetched
 * separately, or the app grows a poller per badge.
 *
 * The realtime subscription lives here rather than on the dashboard because a
 * garage is just as likely to be sitting in a chat or on an offer when a request
 * comes in — mounted only under the dashboard tab, the chime and the badge were
 * silent everywhere else in the app.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { userType, garage } = useAuth()
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY)
  const [liveRequests, setLiveRequests] = useState<LiveRequest[]>([])
  const [tick, setTick] = useState(0)
  const { info } = useToast()
  const { notify } = useNewRequestNotifier()

  // Ids already counted, so a duplicate broadcast (a flaky reconnect replays
  // events) can't inflate the badge.
  const seenRequestIdsRef = useRef<Set<string>>(new Set())

  const enabled = userType === 'client' || userType === 'garage'
  const liveEnabled = userType === 'garage' && !!garage?.isActive
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const markRequestsSeen = useCallback(() => setLiveRequests([]), [])

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
          availableRequests: data.availableRequests ?? 0,
          offersNeedingAttention: data.offersNeedingAttention ?? 0,
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

  const handleNewRequest = useCallback((request: BroadcastRequest) => {
    if (seenRequestIdsRef.current.has(request.id)) return
    seenRequestIdsRef.current.add(request.id)

    const vehicle = [request.vehicle?.brand, request.vehicle?.model].filter(Boolean).join(' ')
    const category = getCategoryText(request.category)

    setSummary((prev) => ({ ...prev, availableRequests: prev.availableRequests + 1 }))
    setLiveRequests((prev) => [
      { id: request.id, category, vehicle: vehicle || undefined, at: request.createdAt },
      ...prev.filter((r) => r.id !== request.id),
    ].slice(0, MAX_LIVE_REQUESTS))

    info('Νέο αίτημα', vehicle ? `${category} — ${vehicle}` : category)
    notify({ category, vehicle })
  }, [info, notify])

  const handleRequestUpdate = useCallback((update: RequestUpdatePayload) => {
    // A request that left PENDING is off the market — drop it from both counters.
    if (!update.status || update.status === ServiceRequestStatus.PENDING) return
    setSummary((prev) => ({ ...prev, availableRequests: Math.max(0, prev.availableRequests - 1) }))
    setLiveRequests((prev) => prev.filter((r) => r.id !== update.requestId))
  }, [])

  const handleReconnect = useCallback(() => {
    // Events during the disconnect window are gone; the poll is the truth.
    seenRequestIdsRef.current.clear()
    refresh()
  }, [refresh])

  useRealtimeRequests({
    enabled: liveEnabled,
    onNewRequest: handleNewRequest,
    onRequestUpdate: handleRequestUpdate,
    onReconnect: handleReconnect,
  })

  return (
    <NotificationsContext.Provider value={{ ...summary, liveRequests, markRequestsSeen, refresh }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext)
}
