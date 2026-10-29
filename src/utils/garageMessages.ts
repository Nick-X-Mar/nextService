import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { collectAll } from '@/utils/pagination'
import { batchGetById } from '@/utils/batchGetById'
import { threadWriteState } from '@/utils/chatService'
import { ServiceRequestStatus, OfferStatus } from '@/types/statuses'
import { TABLES } from '@/lib/tables'

export interface GarageChatMessage {
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName?: string
  message: string
  timestamp: string
  garageId?: string
}

/**
 * Every ChatMessage row belonging to one garage.
 *
 * Prefers `GarageMessagesIndex`. That index is declared in the CDK stack, but
 * infrastructure and application deploy on separate cadences — so when the index
 * is not there yet this falls back to the filtered scan this lookup used to be,
 * rather than failing every garage's dashboard.
 *
 * The fallback is temporary by design: once the index is live it stops running.
 * The scan reads the whole ChatMessages table and was the slowest read in the
 * app, so this should not be left un-deployed indefinitely.
 */
export async function fetchGarageMessages(garageId: string): Promise<GarageChatMessage[]> {
  try {
    return await collectAll<GarageChatMessage>(
      (startKey) => dynamoDB.send(new QueryCommand({
        TableName: TABLES.ChatMessages,
        IndexName: 'GarageMessagesIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: GarageChatMessage[]; LastEvaluatedKey?: Record<string, unknown> }>,
      `garage messages for ${garageId}`
    )
  } catch (error) {
    const name = (error as { name?: string })?.name
    // Anything other than "that index does not exist" is a real failure.
    if (name !== 'ValidationException' && name !== 'ResourceNotFoundException') throw error
    return collectAll<GarageChatMessage>(
      (startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.ChatMessages,
        FilterExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        ExclusiveStartKey: startKey,
      })) as Promise<{ Items?: GarageChatMessage[]; LastEvaluatedKey?: Record<string, unknown> }>,
      `garage messages scan for ${garageId}`
    )
  }
}

/** Everything one garage has touched, loaded once and shared by the summary and the chat lists. */
export interface GarageWorkspace {
  garageId: string
  messages: GarageChatMessage[]
  offers: Record<string, unknown>[]
  /** ServiceRequests rows by id, for every request in `messages` or `offers`. */
  requests: Map<string, Record<string, unknown>>
  /** Vehicles rows by id. ServiceRequests carry only `vehicleId`. */
  vehicles: Map<string, Record<string, unknown>>
}

const REQUEST_PROJECTION =
  'id, garageReadAt, vehicleId, category, #s, appointmentDate, appointmentTime, ' +
  'completedAt, cancelledAt, acceptedGarageId, acceptedOfferId, createdAt'

const VEHICLE_PROJECTION = 'id, brand, model, modelYear'

function isNewerThan(timestamp: unknown, marker?: unknown): boolean {
  if (typeof timestamp !== 'string') return false
  if (typeof marker !== 'string' || !marker) return true
  return new Date(timestamp).getTime() > new Date(marker).getTime()
}

/**
 * A pending offer whose client proposed dates the garage has not opened since
 * (offers/[offerId]/client-availability writes them, notifications/seen with
 * kind 'dates' marks them seen).
 */
export function offerHasUnseenDates(offer: Record<string, unknown>): boolean {
  if (offer.status !== OfferStatus.PENDING) return false
  const dates = offer.clientAvailabilityDates
  if (!Array.isArray(dates) || dates.length === 0) return false
  return isNewerThan(offer.clientAvailabilityProposedAt || offer.updatedAt, offer.garageSeenDatesAt)
}

/**
 * The requests that can put anything on a garage's notification summary:
 *
 *   - a thread holding a client message — only those can be unread;
 *   - an offer the client accepted — the appointment, completion and review
 *     prompts all hang off the job the garage won;
 *   - a pending offer with client dates the garage has not seen.
 *
 * Everything else — a request the garage bid on and lost, one it only wrote
 * into, one whose dates it has seen — can neither be unread nor raise an
 * alert, and is not worth a read on every poll of every open tab. For a garage
 * with a long history that is most of what it ever touched.
 */
function summaryRequestIds(
  garageId: string,
  messages: GarageChatMessage[],
  offers: Record<string, unknown>[]
): string[] {
  return [
    ...messages
      .filter((m) => m.senderType === 'client')
      .map((m) => m.requestId),
    ...offers
      .filter((o) => o.status === OfferStatus.ACCEPTED || offerHasUnseenDates(o))
      .map((o) => o.serviceRequestId as string),
  ]
}

/**
 * `lists` (the chat lists) needs every thread and its car. `summary` reads only
 * the requests that can count — see `summaryRequestIds` — and no vehicles: the
 * summary names a car on a handful of alerts at most, and fetches just those
 * with `hydrateVehicles`. A summary workspace therefore has no row for a
 * thread that cannot be unread, and `garageThreads` leaves it out, which is
 * all the summary uses it for.
 */
export async function loadGarageWorkspace(
  garageId: string,
  { scope = 'lists' }: { scope?: 'lists' | 'summary' } = {}
): Promise<GarageWorkspace> {
  const [messages, offers] = await Promise.all([
    fetchGarageMessages(garageId),
    collectAll<Record<string, unknown>>(
      (startKey) => dynamoDB.send(new QueryCommand({
        TableName: TABLES.Offers,
        IndexName: 'GarageOffersIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        ExclusiveStartKey: startKey,
      })),
      `offers of ${garageId}`
    ),
  ])

  const requestIds = scope === 'summary'
    ? summaryRequestIds(garageId, messages, offers)
    : [
        ...messages.map((m) => m.requestId),
        ...offers.map((o) => o.serviceRequestId as string),
      ]
  const requests = await batchGetById(TABLES.ServiceRequests, requestIds, {
    projection: REQUEST_PROJECTION,
    names: { '#s': 'status' },
  })

  const ws: GarageWorkspace = { garageId, messages, offers, requests, vehicles: new Map() }
  if (scope === 'lists') await hydrateVehicles(ws, [...requests.keys()])
  return ws
}

/** Loads the cars of these requests into the workspace, skipping any already there. */
export async function hydrateVehicles(ws: GarageWorkspace, requestIds: string[]): Promise<void> {
  const missing = requestIds
    .map((id) => ws.requests.get(id)?.vehicleId as string | undefined)
    .filter((id): id is string => !!id && !ws.vehicles.has(id))
  if (missing.length === 0) return
  const found = await batchGetById(TABLES.Vehicles, missing, { projection: VEHICLE_PROJECTION })
  for (const [id, vehicle] of found) ws.vehicles.set(id, vehicle)
}

/**
 * Whether this garage won the request.
 *
 * `acceptedGarageId` is the field; rows booked before it existed carry only
 * `acceptedOfferId`, which for the winner is one of its own offers — so the
 * fallback needs no extra read.
 */
export function isGarageWinner(ws: GarageWorkspace, req: Record<string, unknown>): boolean {
  if (typeof req.acceptedGarageId === 'string' && req.acceptedGarageId) {
    return req.acceptedGarageId === ws.garageId
  }
  const offerId = req.acceptedOfferId
  return typeof offerId === 'string' && ws.offers.some((o) => o.id === offerId)
}

export function vehicleLabel(vehicle: Record<string, unknown> | undefined | null): string | undefined {
  if (!vehicle) return undefined
  return [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || undefined
}

export function requestVehicle(ws: GarageWorkspace, req: Record<string, unknown> | undefined) {
  return req ? ws.vehicles.get(req.vehicleId as string) : undefined
}

/** One conversation in a garage's chat lists. */
export interface GarageThread {
  requestId: string
  status: string
  /** Which of the garage's two chat lists it belongs to. */
  bucket: 'open' | 'appointment'
  /** Client messages newer than this garage's read marker. */
  unread: number
  lastMessage: { message: string; timestamp: string; senderType: 'client' | 'garage' } | null
  category: string | null
  vehicle: { brand?: string; model?: string; modelYear?: string } | null
  appointmentDate: string | null
  appointmentTime: string | null
  completedAt: string | null
  /** Newest of the last message and the request itself, for ordering. */
  activityAt: string
}

/**
 * The conversations a garage can still act on — the one definition both the
 * nav badges and the chat lists are built from.
 *
 * They used to be computed separately: the summary counted unread messages on
 * every request the garage had touched, while the lists showed only pending
 * requests and this garage's appointments from today on. Anything in between —
 * a request another garage won, a completed or cancelled job, yesterday's
 * appointment still waiting to be closed — was counted but never listed, so
 * the badge could not be cleared.
 *
 * A thread is included exactly when the garage may still write in it (see
 * `threadWriteState`). A read-only thread is history: the garage cannot answer
 * it, so an unread message there is not waiting on anybody.
 */
export function garageThreads(ws: GarageWorkspace): GarageThread[] {
  const ids = new Set([
    ...ws.messages.map((m) => m.requestId),
    ...ws.offers.map((o) => o.serviceRequestId as string),
  ])

  const threads: GarageThread[] = []
  for (const requestId of ids) {
    const req = ws.requests.get(requestId)
    if (!req) continue

    // The winner's id is all the rule needs; for anyone else, whether
    // somebody won decides between "assigned elsewhere" and "closed".
    const won = isGarageWinner(ws, req)
    const someoneWon = !!req.acceptedGarageId || !!req.acceptedOfferId
    const winnerId = won ? ws.garageId : someoneWon ? 'another-garage' : null
    if (!threadWriteState(req.status, ws.garageId, winnerId).canWrite) continue

    const lastRead = ((req.garageReadAt || {}) as Record<string, string>)[ws.garageId]
    const own = ws.messages
      .filter((m) => m.requestId === requestId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const unread = own.filter(
      (m) => m.senderType === 'client' && (!lastRead || new Date(m.timestamp).getTime() > new Date(lastRead).getTime())
    ).length
    const last = own[own.length - 1]
    const vehicle = requestVehicle(ws, req)

    const status = (req.status as string | undefined) || ServiceRequestStatus.PENDING
    threads.push({
      requestId,
      status,
      bucket: status === ServiceRequestStatus.PENDING ? 'open' : 'appointment',
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
      appointmentTime: (req.appointmentTime as string | undefined) ?? null,
      completedAt: (req.completedAt as string | undefined) ?? null,
      activityAt: last?.timestamp ?? (req.createdAt as string | undefined) ?? '',
    })
  }

  return threads
}
