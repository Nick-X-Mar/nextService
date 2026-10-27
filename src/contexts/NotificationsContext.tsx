'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNewRequestNotifier } from '@/hooks/useNewRequestNotifier'
import { useRealtimeRequests, type BroadcastRequest, type RequestUpdatePayload } from '@/hooks/useRealtimeRequests'
import { useToast } from '@/hooks/useToast'
import { getCategoryText } from '@/utils/categoryLabels'
import { ServiceRequestStatus } from '@/types/statuses'
import {
  EMPTY_SUMMARY,
  MARKET_SNAPSHOT_MARGIN_MS,
  type Alert,
  type NotificationSummary,
} from '@/types/alerts'

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
// longer than this, so every other poll is a cache hit), fast enough that a
// banner appears while the user is still on the page. New requests don't wait
// for it — those arrive over AppSync below — but everything else (unread
// messages, accepted offers) has no push channel.
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

  // Broadcasts already announced, so a duplicate (a flaky reconnect replays
  // events) doesn't chime and toast twice. The badge itself is keyed by id in
  // `availableRequestIds`, which makes it immune to duplicates on its own.
  const seenRequestIdsRef = useRef<Set<string>>(new Set())

  // What the live channel told us that a poll may not know yet. The summary's
  // market snapshot is shared and cached (see `marketAsOf`), so a poll can
  // answer with a list from before a request arrived — or before one left —
  // and replacing the badge with it would undo what realtime just did, until
  // the next fresh snapshot.
  //   arrivals: id → createdAt, until a snapshot new enough to hold it
  //   departed: left the market, until a poll stops listing it
  const arrivalsRef = useRef<Map<string, string>>(new Map())
  const departedRef = useRef<Set<string>>(new Set())

  const mergeMarket = useCallback((data: Partial<NotificationSummary>): string[] => {
    const polled = Array.isArray(data.availableRequestIds) ? data.availableRequestIds : []
    const listed = new Set(polled)
    const asOf = typeof data.marketAsOf === 'string' ? Date.parse(data.marketAsOf) : NaN
    const answered = new Set(data.recentlyAnsweredIds ?? [])
    const arrivals = arrivalsRef.current
    const departed = departedRef.current

    // No snapshot (a client, or a garage that lost its approval): the poll is
    // all there is.
    if (isNaN(asOf)) {
      arrivals.clear()
      departed.clear()
      return polled
    }

    const kept: string[] = []
    for (const [id, createdAt] of arrivals) {
      const inSnapshot = Date.parse(createdAt) <= asOf - MARKET_SNAPSHOT_MARGIN_MS
      if (inSnapshot || listed.has(id) || answered.has(id)) arrivals.delete(id)
      else kept.push(id)
    }
    for (const id of departed) if (!listed.has(id)) departed.delete(id)
    return [...kept, ...polled].filter((id) => !departed.has(id))
  }, [])

  const enabled = userType === 'client' || userType === 'garage'
  const liveEnabled = userType === 'garage' && !!garage?.isActive
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const markRequestsSeen = useCallback(() => setLiveRequests([]), [])

  useEffect(() => {
    if (!enabled) {
      setSummary(EMPTY_SUMMARY)
      arrivalsRef.current.clear()
      departedRef.current.clear()
      return
    }

    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/notifications/summary/', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.success) return
        const availableRequestIds = mergeMarket(data)
        setSummary({
          threads: data.threads ?? 0,
          appointmentThreads: data.appointmentThreads ?? 0,
          openThreads: data.openThreads ?? 0,
          availableRequests: availableRequestIds.length,
          availableRequestIds,
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
  }, [enabled, tick, mergeMarket])

  const handleNewRequest = useCallback((request: BroadcastRequest) => {
    if (seenRequestIdsRef.current.has(request.id)) return
    seenRequestIdsRef.current.add(request.id)
    arrivalsRef.current.set(request.id, request.createdAt || new Date().toISOString())

    const vehicle = [request.vehicle?.brand, request.vehicle?.model].filter(Boolean).join(' ')
    const category = getCategoryText(request.category)

    setSummary((prev) => {
      if (prev.availableRequestIds.includes(request.id)) return prev
      const availableRequestIds = [request.id, ...prev.availableRequestIds]
      return { ...prev, availableRequestIds, availableRequests: availableRequestIds.length }
    })
    setLiveRequests((prev) => [
      { id: request.id, category, vehicle: vehicle || undefined, at: request.createdAt },
      ...prev.filter((r) => r.id !== request.id),
    ].slice(0, MAX_LIVE_REQUESTS))

    info('Νέο αίτημα', vehicle ? `${category} — ${vehicle}` : category)
    notify({ category, vehicle })
  }, [info, notify])

  const handleRequestUpdate = useCallback((update: RequestUpdatePayload) => {
    // A request that left PENDING is off the market — drop it from both counters.
    // Only if it was on them, though: every status change on every request in
    // the market comes through here, including a job being completed and
    // requests this garage already bid on, and decrementing for those drove
    // the badge below the real number (down to a wrong zero).
    if (!update.status || update.status === ServiceRequestStatus.PENDING) return
    departedRef.current.add(update.requestId)
    arrivalsRef.current.delete(update.requestId)
    setSummary((prev) => {
      if (!prev.availableRequestIds.includes(update.requestId)) return prev
      const availableRequestIds = prev.availableRequestIds.filter((id) => id !== update.requestId)
      return { ...prev, availableRequestIds, availableRequests: availableRequestIds.length }
    })
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
