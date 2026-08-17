import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { unreadCache, unreadCacheKey } from '@/utils/unreadCache'
import { fetchGarageMessages } from '@/utils/garageMessages'
import { collectAll } from '@/utils/pagination'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { EMPTY_SUMMARY, type Alert, type NotificationSummary } from '@/types/alerts'

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
 */

interface ChatMessageItem {
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName?: string
  message: string
  timestamp: string
  garageId?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function isNewerThan(timestamp: string, marker?: string): boolean {
  if (!marker) return true
  return new Date(timestamp).getTime() > new Date(marker).getTime()
}

function vehicleLabel(vehicle: unknown): string | undefined {
  if (!vehicle || typeof vehicle !== 'object') return undefined
  const v = vehicle as { brand?: string; model?: string }
  return [v.brand, v.model].filter(Boolean).join(' ') || undefined
}

/** Days until an ISO date (`YYYY-MM-DD`), counted from local midnight. */
function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

function whenLabel(days: number): string {
  if (days <= 0) return 'σήμερα'
  if (days === 1) return 'αύριο'
  return `σε ${days} μέρες`
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

async function computeForClient(clientId: string): Promise<NotificationSummary> {
  const requestsResult = await dynamoDB.send(new QueryCommand({
    TableName: 'ServiceRequests',
    IndexName: 'ClientRequestsIndex',
    KeyConditionExpression: 'clientId = :clientId',
    ExpressionAttributeValues: { ':clientId': clientId },
    ProjectionExpression:
      'id, clientReadAt, clientOffersSeenAt, vehicle, #s, appointmentDate, depositPaidAt',
    ExpressionAttributeNames: { '#s': 'status' },
  }))

  const requests = requestsResult.Items ?? []
  if (requests.length === 0) return EMPTY_SUMMARY

  const perRequest = await Promise.all(requests.map(async (req) => {
    const [messagesResult, offersResult] = await Promise.all([
      dynamoDB.send(new QueryCommand({
        TableName: 'ChatMessages',
        IndexName: 'RequestMessagesIndex',
        KeyConditionExpression: 'requestId = :requestId',
        ExpressionAttributeValues: { ':requestId': req.id },
      })),
      dynamoDB.send(new QueryCommand({
        TableName: 'Offers',
        IndexName: 'ServiceRequestOffersIndex',
        KeyConditionExpression: 'serviceRequestId = :requestId',
        ExpressionAttributeValues: { ':requestId': req.id },
      })),
    ])

    const readAt = (req.clientReadAt || {}) as Record<string, string>
    const unreadGarages = new Set<string>()
    for (const msg of (messagesResult.Items ?? []) as ChatMessageItem[]) {
      if (msg.senderType !== 'garage') continue
      if (isNewerThan(msg.timestamp, readAt[msg.senderId])) unreadGarages.add(msg.senderId)
    }

    // Offers the client has not looked at since last opening this request.
    const newOffers = (offersResult.Items ?? []).filter(
      (offer) =>
        offer.status !== OfferStatus.REJECTED &&
        isNewerThan(offer.createdAt as string, req.clientOffersSeenAt as string | undefined)
    )

    return {
      requestId: req.id as string,
      status: req.status as string | undefined,
      vehicle: vehicleLabel(req.vehicle),
      appointmentDate: req.appointmentDate as string | undefined,
      depositPaidAt: req.depositPaidAt as string | undefined,
      unreadGarages,
      newOffers: newOffers.length,
    }
  }))

  const base = `/requests/${clientId}`
  const alerts: Alert[] = []

  const threads = perRequest.reduce((n, r) => n + r.unreadGarages.size, 0)
  const appointmentThreads = perRequest
    .filter((r) => r.status === ServiceRequestStatus.APPOINTMENT)
    .reduce((n, r) => n + r.unreadGarages.size, 0)

  if (threads > 0) {
    const shops = new Set(perRequest.flatMap((r) => [...r.unreadGarages])).size
    alerts.push({
      id: 'client-messages',
      kind: 'messages',
      severity: 'action',
      icon: 'mark_chat_unread',
      title: `${shops} ${plural(shops, 'συνεργείο σού έστειλε', 'συνεργεία σού έστειλαν')} μήνυμα`,
      detail: `${threads} ${plural(threads, 'συνομιλία', 'συνομιλίες')} περιμένουν απάντηση`,
      href: `${base}/chats/`,
      cta: 'Άνοιγμα',
    })
  }

  const offerCount = perRequest.reduce((n, r) => n + r.newOffers, 0)
  if (offerCount > 0) {
    const withOffers = perRequest.filter((r) => r.newOffers > 0)
    alerts.push({
      id: 'client-offers',
      kind: 'new-offers',
      severity: 'action',
      icon: 'local_offer',
      title: `${offerCount} ${plural(offerCount, 'νέα προσφορά', 'νέες προσφορές')}`,
      detail: withOffers.map((r) => r.vehicle).filter(Boolean).slice(0, 2).join(', ') || undefined,
      href:
        withOffers.length === 1
          ? `${base}/details/${withOffers[0].requestId}/`
          : `${base}/`,
      cta: 'Δες τις',
    })
  }

  for (const req of perRequest) {
    if (req.status !== ServiceRequestStatus.APPOINTMENT || !req.appointmentDate) continue
    const days = daysUntil(req.appointmentDate)
    if (days < 0 || days > 1) continue
    alerts.push({
      id: `client-appointment-${req.requestId}`,
      kind: 'appointment-soon',
      severity: days === 0 ? 'urgent' : 'action',
      icon: 'event_upcoming',
      title: `Ραντεβού ${whenLabel(days)}`,
      detail: req.vehicle,
      href: `${base}/details/${req.requestId}/`,
      cta: 'Λεπτομέρειες',
    })
  }

  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true') {
    for (const req of perRequest) {
      if (req.status !== ServiceRequestStatus.APPOINTMENT || req.depositPaidAt) continue
      alerts.push({
        id: `client-deposit-${req.requestId}`,
        kind: 'deposit-due',
        severity: 'urgent',
        icon: 'credit_card',
        title: 'Εκκρεμεί η προκαταβολή',
        detail: req.vehicle
          ? `${req.vehicle} — το ραντεβού κλειδώνει με την πληρωμή`
          : 'Το ραντεβού κλειδώνει με την πληρωμή',
        href: `${base}/details/${req.requestId}/`,
        cta: 'Πληρωμή',
      })
    }
  }

  return {
    threads,
    appointmentThreads,
    openThreads: threads - appointmentThreads,
    // Garage-only counters; a client has no market feed and no offers of its own.
    availableRequests: 0,
    offersNeedingAttention: 0,
    alerts,
  }
}

async function computeForGarage(garageId: string): Promise<NotificationSummary> {
  const [messages, offersResult, pendingRows] = await Promise.all([
    fetchGarageMessages(garageId),
    dynamoDB.send(new QueryCommand({
      TableName: 'Offers',
      IndexName: 'GarageOffersIndex',
      KeyConditionExpression: 'garageId = :garageId',
      ExpressionAttributeValues: { ':garageId': garageId },
    })),
    // Every open request in the market. Ids only — this is a badge, and the same
    // number the requests feed shows once opened.
    collectAll<{ id?: string }>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'ServiceRequests',
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': ServiceRequestStatus.PENDING },
          ProjectionExpression: 'id',
          ExclusiveStartKey: startKey,
        })),
      `notifications summary pending requests for ${garageId}`
    ),
  ])

  const offers = offersResult.Items ?? []

  // Requests this garage has already answered drop out of the badge, exactly as
  // they drop out of the feed.
  const answered = new Set(offers.map((o) => o.serviceRequestId as string))
  const availableRequests = pendingRows.filter((r) => r.id && !answered.has(r.id)).length

  const requestIds = [...new Set([
    ...messages.map((m) => m.requestId),
    ...offers.map((o) => o.serviceRequestId as string),
  ])].filter(Boolean)

  if (requestIds.length === 0) return { ...EMPTY_SUMMARY, availableRequests }

  const requestRows = await Promise.all(requestIds.map((id) =>
    dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id },
      ProjectionExpression: 'id, garageReadAt, vehicle, #s, appointmentDate, clientAvailabilityDates',
      ExpressionAttributeNames: { '#s': 'status' },
    }))
  ))
  const requestById = new Map(
    requestRows
      .map((r) => r.Item)
      .filter((r): r is Record<string, unknown> => !!r)
      .map((r) => [r.id as string, r])
  )

  const base = `/garage-dashboard/${garageId}`
  const alerts: Alert[] = []

  let threads = 0
  let appointmentThreads = 0
  for (const requestId of requestIds) {
    const req = requestById.get(requestId)
    if (!req) continue
    const lastRead = ((req.garageReadAt || {}) as Record<string, string>)[garageId]
    const hasUnread = messages.some(
      (m) => m.requestId === requestId && m.senderType === 'client' && isNewerThan(m.timestamp, lastRead)
    )
    if (!hasUnread) continue
    threads += 1
    if (req.status === ServiceRequestStatus.APPOINTMENT) appointmentThreads += 1
  }

  if (threads > 0) {
    alerts.push({
      id: 'garage-messages',
      kind: 'messages',
      severity: 'action',
      icon: 'mark_chat_unread',
      title: `${threads} ${plural(threads, 'πελάτης σού έστειλε', 'πελάτες σού έστειλαν')} μήνυμα`,
      href: `${base}/chats/`,
      cta: 'Άνοιγμα',
    })
  }

  // An accepted offer the garage has not opened since it was accepted. Email
  // already goes out; this is the in-app half, for a garage that reads email rarely.
  const freshlyAccepted = offers.filter(
    (o) =>
      o.status === OfferStatus.ACCEPTED &&
      isNewerThan((o.acceptedAt || o.updatedAt) as string, o.garageSeenAcceptedAt as string | undefined)
  )
  if (freshlyAccepted.length > 0) {
    const one = freshlyAccepted.length === 1 ? freshlyAccepted[0] : null
    alerts.push({
      id: 'garage-accepted',
      kind: 'offer-accepted',
      severity: 'action',
      icon: 'verified',
      title: `${freshlyAccepted.length} ${plural(freshlyAccepted.length, 'προσφορά έγινε δεκτή', 'προσφορές έγιναν δεκτές')}`,
      detail: one
        ? vehicleLabel(requestById.get(one.serviceRequestId as string)?.vehicle)
        : undefined,
      href: one ? `${base}/offers/${one.serviceRequestId}/` : `${base}/?tab=offers`,
      cta: 'Δες το',
    })
  }

  // Appointments landing today or tomorrow.
  for (const offer of offers) {
    if (offer.status !== OfferStatus.ACCEPTED || !offer.appointmentDate) continue
    const days = daysUntil(offer.appointmentDate as string)
    if (days < 0 || days > 1) continue
    const req = requestById.get(offer.serviceRequestId as string)
    alerts.push({
      id: `garage-appointment-${offer.serviceRequestId}`,
      kind: 'appointment-soon',
      severity: days === 0 ? 'urgent' : 'action',
      icon: 'event_upcoming',
      title: `Ραντεβού ${whenLabel(days)}`,
      detail: vehicleLabel(req?.vehicle),
      href: `${base}/chats/appointments/`,
      cta: 'Δες το',
    })
  }

  // The client proposed dates on a request this garage has bid on, and no
  // appointment has been agreed yet — the ball is in the garage's court.
  const awaitingDates = offers.filter((offer) => {
    if (offer.status !== OfferStatus.PENDING) return false
    const req = requestById.get(offer.serviceRequestId as string)
    const dates = req?.clientAvailabilityDates
    return Array.isArray(dates) && dates.length > 0
  })
  if (awaitingDates.length > 0) {
    const one = awaitingDates.length === 1 ? awaitingDates[0] : null
    alerts.push({
      id: 'garage-dates',
      kind: 'client-dates',
      severity: 'info',
      icon: 'event_available',
      title: `${awaitingDates.length} ${plural(awaitingDates.length, 'πελάτης πρότεινε', 'πελάτες πρότειναν')} ημερομηνίες`,
      detail: one
        ? vehicleLabel(requestById.get(one.serviceRequestId as string)?.vehicle)
        : undefined,
      href: one ? `${base}/offers/${one.serviceRequestId}/` : `${base}/?tab=offers`,
      cta: 'Απάντησε',
    })
  }

  return {
    threads,
    appointmentThreads,
    openThreads: threads - appointmentThreads,
    availableRequests,
    offersNeedingAttention: freshlyAccepted.length + awaitingDates.length,
    alerts,
  }
}

async function _GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    if (auth.userType !== 'client' && auth.userType !== 'garage') {
      return NextResponse.json({ success: true, ...EMPTY_SUMMARY })
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
