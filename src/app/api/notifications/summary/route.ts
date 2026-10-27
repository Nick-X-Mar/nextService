import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireActiveGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { unreadCache, unreadCacheKey, pendingMarket } from '@/utils/unreadCache'
import {
  loadGarageWorkspace,
  garageThreads,
  hydrateVehicles,
  isGarageWinner,
  offerHasUnseenDates,
  requestVehicle,
  vehicleLabel,
} from '@/utils/garageMessages'
import { loadClientWorkspace, clientThreads } from '@/utils/clientThreads'
import { reviewedRequestIds, withinReviewWindow } from '@/utils/reviewLookup'
import { athensDaysUntil } from '@/utils/athensTime'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import {
  EMPTY_SUMMARY,
  MARKET_SNAPSHOT_MARGIN_MS,
  type Alert,
  type NotificationSummary,
} from '@/types/alerts'
import { isCompletionDue } from '@/types/reviews'

/**
 * Everything currently waiting on the signed-in user, in one call.
 *
 * The app shell polls this once and shares it with the nav badges and the banner
 * stack. That is deliberate: the browser used to work out "has anyone written to
 * me" by fetching every request, then every request's messages, then every
 * counterparty — a waterfall far too expensive to run on every page. Each new
 * notification added here costs nothing extra on the wire.
 *
 * Read state lives on the request as id -> ISO maps (`clientReadAt`,
 * `garageReadAt`, `clientOffersSeenAt`) so a thread can be read for one
 * counterparty and unread for another. See chat/[requestId]/mark-read.
 *
 * Unread counts come from `garageThreads` / `clientThreads`, the same functions
 * the chat lists render from, so a badge can never count a conversation the
 * user has no way to open.
 */

function isNewerThan(timestamp: unknown, marker?: unknown): boolean {
  if (typeof timestamp !== 'string') return false
  if (typeof marker !== 'string' || !marker) return true
  return new Date(timestamp).getTime() > new Date(marker).getTime()
}

/** 0 for today, 1 for tomorrow — or null when the date is not today or tomorrow. */
function soonDays(date: unknown): 0 | 1 | null {
  if (typeof date !== 'string') return null
  const days = athensDaysUntil(date)
  return days === 0 ? 0 : days === 1 ? 1 : null
}

function whenLabel(days: 0 | 1): string {
  return days === 0 ? 'σήμερα' : 'αύριο'
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

async function computeForClient(clientId: string): Promise<NotificationSummary> {
  const ws = await loadClientWorkspace(clientId, { scope: 'summary' })
  if (ws.requests.length === 0) return EMPTY_SUMMARY

  const base = `/requests/${clientId}`
  const alerts: Alert[] = []
  const labelOf = (req: Record<string, unknown>) =>
    vehicleLabel(ws.vehicles.get(req.vehicleId as string))

  const unread = clientThreads(ws).filter((t) => t.unread > 0)
  const threads = unread.length
  const appointmentThreads = unread.filter((t) => t.bucket === 'appointment').length

  if (threads > 0) {
    const shops = new Set(unread.map((t) => t.garageId)).size
    const one = threads === 1 ? unread[0] : null
    alerts.push({
      id: 'client-messages',
      kind: 'messages',
      severity: 'action',
      icon: 'mark_chat_unread',
      title: `${shops} ${plural(shops, 'συνεργείο σού έστειλε', 'συνεργεία σού έστειλαν')} μήνυμα`,
      detail: `${threads} ${plural(threads, 'συνομιλία', 'συνομιλίες')} περιμένουν απάντηση`,
      href: one ? `${base}/chats/${one.requestId}/?garageId=${one.garageId}` : `${base}/chats/`,
      cta: 'Άνοιγμα',
    })
  }

  // Offers the client has not looked at since last opening this request. The
  // workspace holds offers of pending requests only: once a request is booked,
  // cancelled or done there is no offer left to choose.
  const withOffers = ws.requests
    .map((req) => ({
      req,
      count: (ws.offersByRequest.get(req.id as string) ?? []).filter(
        (offer) =>
          offer.status !== OfferStatus.REJECTED &&
          isNewerThan(offer.createdAt, req.clientOffersSeenAt)
      ).length,
    }))
    .filter((r) => r.count > 0)
  const offerCount = withOffers.reduce((n, r) => n + r.count, 0)
  if (offerCount > 0) {
    alerts.push({
      id: 'client-offers',
      kind: 'new-offers',
      severity: 'action',
      icon: 'local_offer',
      title: `${offerCount} ${plural(offerCount, 'νέα προσφορά', 'νέες προσφορές')}`,
      detail: withOffers.map((r) => labelOf(r.req)).filter(Boolean).slice(0, 2).join(', ') || undefined,
      href:
        withOffers.length === 1
          ? `${base}/details/${withOffers[0].req.id}/`
          : `${base}/`,
      cta: 'Δες τις',
    })
  }

  for (const req of ws.requests) {
    if (req.status !== ServiceRequestStatus.APPOINTMENT) continue
    const days = soonDays(req.appointmentDate)
    if (days === null) continue
    // Once the slot is over, "today" is no longer news.
    if (isCompletionDue(req.appointmentDate as string, (req.appointmentTime as string | null) ?? null)) continue
    alerts.push({
      id: `client-appointment-${req.id}`,
      kind: 'appointment-soon',
      severity: days === 0 ? 'urgent' : 'action',
      icon: 'event_upcoming',
      title: `Ραντεβού ${whenLabel(days)}`,
      detail: labelOf(req),
      href: `${base}/details/${req.id}/`,
      cta: 'Λεπτομέρειες',
    })
  }

  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true') {
    for (const req of ws.requests) {
      if (req.status !== ServiceRequestStatus.APPOINTMENT || req.depositPaidAt) continue
      const vehicle = labelOf(req)
      alerts.push({
        id: `client-deposit-${req.id}`,
        kind: 'deposit-due',
        severity: 'urgent',
        icon: 'credit_card',
        title: 'Εκκρεμεί η προκαταβολή',
        detail: vehicle
          ? `${vehicle} — το ραντεβού κλειδώνει με την πληρωμή`
          : 'Το ραντεβού κλειδώνει με την πληρωμή',
        href: `${base}/details/${req.id}/`,
        cta: 'Πληρωμή',
      })
    }
  }

  // The garage has closed the job; the client's side of the review is missing.
  // This is the primary prompt, not the email: NOTIFICATIONS_ENABLED is off in
  // production, so an in-app alert is the only thing the client reliably sees.
  const completedNeedingReview = ws.requests.filter(
    (req) => req.status === ServiceRequestStatus.COMPLETED && withinReviewWindow(req.completedAt)
  )
  if (completedNeedingReview.length > 0) {
    const reviewed = await reviewedRequestIds(
      completedNeedingReview.map((r) => r.id as string),
      'client_to_garage'
    )
    for (const req of completedNeedingReview) {
      if (reviewed.has(req.id as string)) continue
      const vehicle = labelOf(req)
      alerts.push({
        id: `client-review-${req.id}`,
        kind: 'review-due',
        severity: 'action',
        icon: 'star',
        title: 'Πώς πήγε η επισκευή;',
        detail: vehicle ? `${vehicle} — αξιολόγησε το συνεργείο` : 'Αξιολόγησε το συνεργείο',
        href: `${base}/details/${req.id}/`,
        cta: 'Αξιολόγηση',
      })
    }
  }

  return {
    threads,
    appointmentThreads,
    openThreads: threads - appointmentThreads,
    // Garage-only counters; a client has no market feed and no offers of its own.
    availableRequests: 0,
    availableRequestIds: [],
    offersNeedingAttention: 0,
    alerts,
  }
}

/** An alert whose `detail` is the car of `labelFor`, filled in once the cars are loaded. */
type DraftAlert = Alert & { labelFor?: string }

async function computeForGarage(garageId: string): Promise<NotificationSummary> {
  const [ws, market] = await Promise.all([
    loadGarageWorkspace(garageId, { scope: 'summary' }),
    // Every open request in the market, shared across garages — see pendingMarket.
    pendingMarket(),
  ])

  const { offers, requests } = ws

  // Requests this garage has already answered drop out of the badge, exactly as
  // they drop out of the feed.
  const answered = new Set(offers.map((o) => o.serviceRequestId as string))
  const availableRequestIds = market.ids.filter((id) => !answered.has(id))
  // Bids on requests the snapshot may not hold yet, so the browser — which
  // learned of them over realtime — can drop them too.
  const answeredAfter = new Date(market.asOf).getTime() - MARKET_SNAPSHOT_MARGIN_MS
  const recentlyAnsweredIds = offers
    .filter((o) => typeof o.createdAt !== 'string' || new Date(o.createdAt).getTime() > answeredAfter)
    .map((o) => o.serviceRequestId as string)
    .filter((id) => !!id)

  const base = `/garage-dashboard/${garageId}`
  const alerts: DraftAlert[] = []

  const unread = garageThreads(ws).filter((t) => t.unread > 0)
  const threads = unread.length
  const appointmentThreads = unread.filter((t) => t.bucket === 'appointment').length
  const openThreads = threads - appointmentThreads

  if (threads > 0) {
    const one = threads === 1 ? unread[0] : null
    alerts.push({
      id: 'garage-messages',
      kind: 'messages',
      severity: 'action',
      icon: 'mark_chat_unread',
      title: `${threads} ${plural(threads, 'πελάτης σού έστειλε', 'πελάτες σού έστειλαν')} μήνυμα`,
      labelFor: one?.requestId,
      // Straight into the thread when there is only one; otherwise the list
      // that holds them (both lists link to each other).
      href: one
        ? `${base}/chat/${one.requestId}/`
        : openThreads > 0 ? `${base}/chats/` : `${base}/chats/appointments/`,
      cta: 'Άνοιγμα',
    })
  }

  // Offers this garage won whose job is still booked, by request.
  const liveAppointments = offers.filter((offer) => {
    if (offer.status !== OfferStatus.ACCEPTED) return false
    const req = requests.get(offer.serviceRequestId as string)
    return req?.status === ServiceRequestStatus.APPOINTMENT && isGarageWinner(ws, req)
  })

  // An accepted offer the garage has not opened since it was accepted. Email
  // already goes out; this is the in-app half, for a garage that reads email
  // rarely. Only while the job is still booked: once it is completed or
  // cancelled there is nothing left to see, and opening the offer used to be
  // the only thing that cleared it.
  const freshlyAccepted = liveAppointments.filter((o) =>
    isNewerThan(o.acceptedAt || o.updatedAt, o.garageSeenAcceptedAt)
  )
  if (freshlyAccepted.length > 0) {
    const one = freshlyAccepted.length === 1 ? freshlyAccepted[0] : null
    alerts.push({
      id: 'garage-accepted',
      kind: 'offer-accepted',
      severity: 'action',
      icon: 'verified',
      title: `${freshlyAccepted.length} ${plural(freshlyAccepted.length, 'προσφορά έγινε δεκτή', 'προσφορές έγιναν δεκτές')}`,
      labelFor: one ? (one.serviceRequestId as string) : undefined,
      href: one ? `${base}/offers/${one.serviceRequestId}/` : `${base}/?tab=offers`,
      cta: 'Δες το',
    })
  }

  // Appointments landing today or tomorrow. Read the date off the request, not
  // the offer: both carry it, but the request is the row the booking and
  // rescheduling paths actually write.
  for (const offer of liveAppointments) {
    const requestId = offer.serviceRequestId as string
    const req = requests.get(requestId)!
    const date = req.appointmentDate ?? offer.appointmentDate
    const days = soonDays(date)
    if (days === null) continue
    // Past its slot, it is the completion prompt below that matters.
    if (isCompletionDue(date as string, (req.appointmentTime as string | null) ?? null)) continue
    alerts.push({
      id: `garage-appointment-${requestId}`,
      kind: 'appointment-soon',
      severity: days === 0 ? 'urgent' : 'action',
      icon: 'event_upcoming',
      title: `Ραντεβού ${whenLabel(days)}`,
      labelFor: requestId,
      href: `${base}/chats/appointments/`,
      cta: 'Δες το',
    })
  }

  // An appointment whose slot has passed and that nobody has closed. This is
  // the prompt the whole completion flow hangs off: it is what asks the garage
  // to say the job happened, declare what it charged, and rate the client.
  // Deliberately in-app rather than email-only — NOTIFICATIONS_ENABLED is off
  // in production, so email cannot be the only channel.
  for (const offer of liveAppointments) {
    const requestId = offer.serviceRequestId as string
    const req = requests.get(requestId)!
    if (typeof req.appointmentDate !== 'string') continue
    if (!isCompletionDue(req.appointmentDate, (req.appointmentTime as string | null) ?? null)) continue
    alerts.push({
      id: `garage-completion-${requestId}`,
      kind: 'completion-due',
      severity: 'action',
      icon: 'task_alt',
      title: 'Έγινε η επισκευή;',
      labelFor: requestId,
      href: `${base}/?tab=appointments`,
      cta: 'Δήλωσέ το',
    })
  }

  // Jobs this garage closed but has not rated the client on. The review form
  // is on the job's chat page; with several, the appointments list marks which.
  const closedByThisGarage = [...requests.values()]
    .filter(
      (req) =>
        req.status === ServiceRequestStatus.COMPLETED &&
        isGarageWinner(ws, req) &&
        withinReviewWindow(req.completedAt)
    )
    .map((req) => req.id as string)
  if (closedByThisGarage.length > 0) {
    const reviewed = await reviewedRequestIds(closedByThisGarage, 'garage_to_client')
    const pendingReview = closedByThisGarage.filter((id) => !reviewed.has(id))
    if (pendingReview.length > 0) {
      const one = pendingReview.length === 1 ? pendingReview[0] : null
      alerts.push({
        id: 'garage-review-due',
        kind: 'review-due',
        severity: 'info',
        icon: 'star',
        title: `${pendingReview.length} ${plural(pendingReview.length, 'πελάτης περιμένει', 'πελάτες περιμένουν')} αξιολόγηση`,
        labelFor: one ?? undefined,
        href: one ? `${base}/chat/${one}/` : `${base}/chats/appointments/`,
        cta: 'Αξιολόγησε',
      })
    }
  }

  // The client proposed dates on an offer of this garage's, and no appointment
  // has been agreed yet — the ball is in the garage's court. The dates live on
  // the offer (offers/[offerId]/client-availability writes them there), not on
  // the request. Opening the offer marks them seen (notifications/seen, kind
  // 'dates'), so the alert comes back only when the client proposes again.
  const awaitingDates = offers.filter((offer) => {
    if (!offerHasUnseenDates(offer)) return false
    return requests.get(offer.serviceRequestId as string)?.status === ServiceRequestStatus.PENDING
  })
  if (awaitingDates.length > 0) {
    const one = awaitingDates.length === 1 ? awaitingDates[0] : null
    alerts.push({
      id: 'garage-dates',
      kind: 'client-dates',
      severity: 'info',
      icon: 'event_available',
      title: `${awaitingDates.length} ${plural(awaitingDates.length, 'πελάτης πρότεινε', 'πελάτες πρότειναν')} ημερομηνίες`,
      labelFor: one ? (one.serviceRequestId as string) : undefined,
      href: one ? `${base}/offers/${one.serviceRequestId}/` : `${base}/?tab=offers`,
      cta: 'Απάντησε',
    })
  }

  // Only now the cars, and only those an alert names.
  await hydrateVehicles(ws, alerts.map((a) => a.labelFor).filter((id): id is string => !!id))

  return {
    threads,
    appointmentThreads,
    openThreads,
    availableRequests: availableRequestIds.length,
    availableRequestIds,
    marketAsOf: market.asOf,
    recentlyAnsweredIds,
    offersNeedingAttention: freshlyAccepted.length + awaitingDates.length,
    alerts: alerts.map(({ labelFor, ...alert }) =>
      labelFor ? { ...alert, detail: vehicleLabel(requestVehicle(ws, requests.get(labelFor))) } : alert
    ),
  }
}

async function _GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    if (auth.userType !== 'client' && auth.userType !== 'garage') {
      return NextResponse.json({ success: true, ...EMPTY_SUMMARY })
    }

    // A pending or deactivated garage still holds a garage JWT. Its summary
    // would carry client data — vehicles, unread counts, appointments — so it
    // gets the empty one, and before the cache is consulted: a garage
    // deactivated a moment ago must not be served its last summary.
    if (auth.userType === 'garage') {
      const active = await requireActiveGarage(request)
      if (active instanceof NextResponse) {
        return active.status === 403
          ? NextResponse.json({ success: true, ...EMPTY_SUMMARY })
          : active
      }
    }

    const summary = await unreadCache.getOrCompute(
      unreadCacheKey(auth.userType, auth.userId),
      () =>
        auth.userType === 'client'
          ? computeForClient(auth.userId)
          : computeForGarage(auth.userId)
    )

    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('Error computing notification summary:', error)
    return NextResponse.json({ error: 'Error computing notification summary' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
