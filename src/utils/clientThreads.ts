import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { collectAll } from '@/utils/pagination'
import { batchGetById } from '@/utils/batchGetById'
import { threadWriteState } from '@/utils/chatService'
import { ServiceRequestStatus } from '@/types/statuses'

interface ClientChatMessage {
  senderId: string
  senderType: 'client' | 'garage'
  message: string
  timestamp: string
  garageId?: string
}

/** Everything one client's notifications and chat list are built from, loaded once. */
export interface ClientWorkspace {
  clientId: string
  requests: Record<string, unknown>[]
  /** Only for the requests the scope reads messages of — see `loadClientWorkspace`. */
  messagesByRequest: Map<string, ClientChatMessage[]>
  /** Summary scope only, and only for pending requests. */
  offersByRequest: Map<string, Record<string, unknown>[]>
  /** The garage that won each request that has one. */
  winners: Map<string, string>
  /** Vehicles rows by id. ServiceRequests carry only `vehicleId`. */
  vehicles: Map<string, Record<string, unknown>>
}

/**
 * How many requests' messages and offers are read at once. A client's history
 * only grows, and an unbounded fan-out turned every poll from a long-standing
 * customer into a burst of dozens of simultaneous queries.
 */
const REQUEST_CONCURRENCY = 6

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

function fetchMessages(requestId: string): Promise<ClientChatMessage[]> {
  return collectAll<ClientChatMessage>(
    (startKey) => dynamoDB.send(new QueryCommand({
      TableName: 'ChatMessages',
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :requestId',
      ExpressionAttributeValues: { ':requestId': requestId },
      // Bodies only for the preview line; attachments never leave here.
      ProjectionExpression: 'senderId, senderType, #msg, #ts, garageId',
      ExpressionAttributeNames: { '#ts': 'timestamp', '#msg': 'message' },
      ExclusiveStartKey: startKey,
    })) as Promise<{ Items?: ClientChatMessage[]; LastEvaluatedKey?: Record<string, unknown> }>,
    `messages of ${requestId}`
  )
}

function fetchOffers(requestId: string): Promise<Record<string, unknown>[]> {
  return collectAll<Record<string, unknown>>(
    (startKey) => dynamoDB.send(new QueryCommand({
      TableName: 'Offers',
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :requestId',
      ExpressionAttributeValues: { ':requestId': requestId },
      ExclusiveStartKey: startKey,
    })),
    `offers on ${requestId}`
  )
}

/**
 * `lists` (the chat list) reads every request's messages — a cancelled
 * request's threads are still listed, as history.
 *
 * `summary` reads only what can produce a count or an alert:
 *   - messages of requests that are not cancelled. A cancelled request's
 *     threads are all read-only, so nothing in them is unread;
 *   - offers of pending requests only. "New offers" is a prompt to choose one,
 *     which stops making sense once the request is booked, cancelled or done.
 *
 * Either way the winner of a request comes from `acceptedGarageId`, or — for
 * rows booked before that field — one batched read of the accepted offers.
 */
export async function loadClientWorkspace(
  clientId: string,
  { scope = 'lists' }: { scope?: 'lists' | 'summary' } = {}
): Promise<ClientWorkspace> {
  const requests = await collectAll<Record<string, unknown>>(
    (startKey) => dynamoDB.send(new QueryCommand({
      TableName: 'ServiceRequests',
      IndexName: 'ClientRequestsIndex',
      KeyConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: { ':clientId': clientId },
      ProjectionExpression:
        'id, clientReadAt, clientOffersSeenAt, vehicleId, category, #s, appointmentDate, ' +
        'appointmentTime, depositPaidAt, completedAt, acceptedGarageId, acceptedOfferId, createdAt',
      ExpressionAttributeNames: { '#s': 'status' },
      ExclusiveStartKey: startKey,
    })),
    `requests of ${clientId}`
  )

  const messagesByRequest = new Map<string, ClientChatMessage[]>()
  const offersByRequest = new Map<string, Record<string, unknown>[]>()
  const winners = new Map<string, string>()

  const withMessages = scope === 'summary'
    ? requests.filter((r) => r.status !== ServiceRequestStatus.CANCELLED)
    : requests
  const withOffers = scope === 'summary'
    ? requests.filter((r) => (r.status || ServiceRequestStatus.PENDING) === ServiceRequestStatus.PENDING)
    : []

  const legacyAccepted = new Map<string, string>()
  for (const req of requests) {
    if (typeof req.acceptedGarageId === 'string' && req.acceptedGarageId) {
      winners.set(req.id as string, req.acceptedGarageId)
    } else if (typeof req.acceptedOfferId === 'string' && req.acceptedOfferId) {
      legacyAccepted.set(req.acceptedOfferId, req.id as string)
    }
  }

  const [vehicles, acceptedOffers] = await Promise.all([
    batchGetById('Vehicles', requests.map((r) => r.vehicleId as string | undefined), {
      projection: 'id, brand, model, modelYear',
    }),
    batchGetById('Offers', [...legacyAccepted.keys()], { projection: 'id, garageId' }),
    mapLimit(withMessages, REQUEST_CONCURRENCY, async (req) => {
      messagesByRequest.set(req.id as string, await fetchMessages(req.id as string))
    }),
    mapLimit(withOffers, REQUEST_CONCURRENCY, async (req) => {
      offersByRequest.set(req.id as string, await fetchOffers(req.id as string))
    }),
  ])

  for (const [offerId, requestId] of legacyAccepted) {
    const garageId = acceptedOffers.get(offerId)?.garageId
    if (typeof garageId === 'string') winners.set(requestId, garageId)
  }

  return { clientId, requests, messagesByRequest, offersByRequest, winners, vehicles }
}

/** The garage that won a request, if any. */
export function clientRequestWinner(ws: ClientWorkspace, req: Record<string, unknown>): string | null {
  return ws.winners.get(req.id as string) ?? null
}

/** One conversation (request × garage) in the client's chat list. */
export interface ClientThread {
  requestId: string
  garageId: string
  status: string
  /**
   * open        — the request is still on the market
   * appointment — the thread with the garage that got the job
   * history     — read-only: another garage got it, or the request was cancelled
   */
  bucket: 'open' | 'appointment' | 'history'
  /** Garage messages newer than the client's read marker. Always 0 in history. */
  unread: number
  lastMessage: { message: string; timestamp: string; senderType: 'client' | 'garage' } | null
  category: string | null
  vehicle: { brand?: string; model?: string; modelYear?: string } | null
  appointmentDate: string | null
  activityAt: string
}

/**
 * The client's conversations — the one definition both the Μηνύματα badge and
 * the chat list are built from.
 *
 * A thread exists once either side has written in it. Its unread messages
 * count only while the thread can still be answered (see `threadWriteState`):
 * a garage that lost the job, or a cancelled request, is history, and a
 * message there is not waiting on the client. Counting those is what left the
 * badge stuck on a number the list could not account for.
 */
export function clientThreads(ws: ClientWorkspace): ClientThread[] {
  const threads: ClientThread[] = []

  for (const req of ws.requests) {
    const requestId = req.id as string
    const messages = ws.messagesByRequest.get(requestId) ?? []
    const byGarage = new Map<string, ClientChatMessage[]>()
    for (const msg of messages) {
      // A client message without `garageId` predates per-garage threads and
      // belongs to none of them.
      const garageId = msg.senderType === 'garage' ? msg.senderId : msg.garageId
      if (!garageId) continue
      const list = byGarage.get(garageId) ?? []
      list.push(msg)
      byGarage.set(garageId, list)
    }
    if (byGarage.size === 0) continue

    const status = (req.status as string | undefined) || ServiceRequestStatus.PENDING
    const winnerId = clientRequestWinner(ws, req)
    const readAt = (req.clientReadAt || {}) as Record<string, string>
    const vehicle = ws.vehicles.get(req.vehicleId as string)

    for (const [garageId, list] of byGarage) {
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      const writable = threadWriteState(status, garageId, winnerId).canWrite
      const lastRead = readAt[garageId]
      const unread = writable
        ? list.filter(
            (m) => m.senderType === 'garage' &&
              (!lastRead || new Date(m.timestamp).getTime() > new Date(lastRead).getTime())
          ).length
        : 0
      const last = list[list.length - 1]

      threads.push({
        requestId,
        garageId,
        status,
        bucket: !writable ? 'history' : status === ServiceRequestStatus.PENDING ? 'open' : 'appointment',
        unread,
        lastMessage: last
          ? { message: last.message, timestamp: last.timestamp, senderType: last.senderType }
          : null,
        category: (req.category as string | undefined) ?? null,
        vehicle: vehicle
          ? {
              brand: vehicle.brand as string | undefined,
              model: vehicle.model as string | undefined,
              modelYear: vehicle.modelYear as string | undefined,
            }
          : null,
        appointmentDate: (req.appointmentDate as string | undefined) ?? null,
        activityAt: last?.timestamp ?? (req.createdAt as string | undefined) ?? '',
      })
    }
  }

  return threads
}
