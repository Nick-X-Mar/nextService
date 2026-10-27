// Helper for fan-out of service-request lifecycle events to garage dashboards
// over AppSync. Centralises the channel names, payload shape, and the
// enrichment (client + vehicle + presigned photo URLs) so that callers in API
// routes only need to provide the request id.
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { generatePresignedUrls } from '@/utils/s3Service'
import appSyncService from '@/lib/appsync-service'
import {
  garageClientView,
  garageVehicleView,
  QUOTING_CLIENT_PROJECTION,
  QUOTING_VEHICLE_NAMES,
  QUOTING_VEHICLE_PROJECTION,
  type GarageClientView,
} from '@/utils/garageClientView'

// Channel names. Keep in sync with the client-side useRealtimeRequests hook.
export const NEW_REQUESTS_CHANNEL = 'new-requests'
export const REQUEST_UPDATES_CHANNEL = 'request-updates'

// Discriminator on the payload, used by subscribers to ignore unrelated
// events that may arrive on a shared connection.
type NewRequestEvent = {
  __type: 'new-request'
  request: BroadcastRequest
}

type RequestUpdateEvent = {
  __type: 'request-update'
  requestId: string
  status: string
  reason?: string
}

// Photos arrive on a second HTTP call, after the request row (and therefore
// the new-request broadcast) already exists. This event carries the completed
// set so a dashboard that is already showing the card can fill it in.
type RequestPhotosEvent = {
  __type: 'request-photos'
  requestId: string
  photoUrls: string[]
}

// The quoting view (src/utils/garageClientView.ts): this goes to every active
// garage at once, before anyone has won, so it never carries the client's
// surname, phone or email, or the car's plate, VIN or engine number.
interface BroadcastRequest {
  id: string
  description?: string
  category: string
  status: string
  createdAt: string
  clientAvailabilityDates?: string[]
  photoUrls: string[]
  estimatedCost?: number | null
  client: GarageClientView | null
  vehicle: ReturnType<typeof garageVehicleView>
}

/**
 * `id` is the partition key on all three tables this reads, so this is a point
 * lookup. It used to be a Scan with `FilterExpression: 'id = :id'`, which read
 * every row in the table and threw all but one away — three full table scans on
 * every single new request, on the path that fans out to every active garage.
 */
async function loadById(
  table: string,
  id: string,
  projection?: { expression: string; names?: Record<string, string> }
) {
  const res = await dynamoDB.send(new GetCommand({
    TableName: table,
    Key: { id },
    ...(projection
      ? { ProjectionExpression: projection.expression, ExpressionAttributeNames: projection.names }
      : {}),
  }))
  return res.Item
}

// Look up everything a garage dashboard card needs to render, mirroring the
// shape returned by /api/garage/available-requests.
async function buildBroadcastRequest(serviceRequestId: string): Promise<BroadcastRequest | null> {
  const request = await loadById('ServiceRequests', serviceRequestId)
  if (!request) return null

  const [client, vehicle] = await Promise.all([
    request.clientId
      ? loadById('Clients', request.clientId, { expression: QUOTING_CLIENT_PROJECTION })
      : Promise.resolve(null),
    request.vehicleId
      ? loadById('Vehicles', request.vehicleId, {
          expression: QUOTING_VEHICLE_PROJECTION,
          names: QUOTING_VEHICLE_NAMES,
        })
      : Promise.resolve(null),
  ])

  const rawUrls: string[] = request.photoUrls || []
  const presignedUrls = rawUrls.length > 0
    ? await generatePresignedUrls(rawUrls)
    : []

  return {
    id: request.id,
    description: request.description,
    category: request.category,
    status: request.status,
    createdAt: request.createdAt,
    clientAvailabilityDates: request.clientAvailabilityDates || [],
    photoUrls: presignedUrls,
    estimatedCost: request.estimatedCost ?? null,
    client: garageClientView(client, false),
    vehicle: garageVehicleView(vehicle, false),
  }
}

// Fire-and-forget — broadcasting must never delay the API response. Errors
// are logged but not rethrown.
export async function broadcastNewRequest(serviceRequestId: string): Promise<void> {
  try {
    const enriched = await buildBroadcastRequest(serviceRequestId)
    if (!enriched) {
      console.warn(`[requestBroadcast] Service request ${serviceRequestId} not found, skipping new-request broadcast`)
      return
    }
    const event: NewRequestEvent = { __type: 'new-request', request: enriched }
    await appSyncService.publishEvent(NEW_REQUESTS_CHANNEL, event)
    console.log(`[requestBroadcast] Broadcasted new request ${serviceRequestId}`)
  } catch (error) {
    console.error('[requestBroadcast] Error broadcasting new request:', error)
  }
}

/**
 * Push the current photo set for a request to every listening dashboard.
 *
 * The submission flow creates the request first and uploads the photos second,
 * so `broadcastNewRequest` necessarily fires while `photoUrls` is still empty.
 * Without this follow-up the live card claimed the request had no photos until
 * the garage happened to reload the page — which is most of why garages
 * reported never seeing them.
 */
export async function broadcastRequestPhotos(serviceRequestId: string): Promise<void> {
  try {
    const request = await loadById('ServiceRequests', serviceRequestId)
    if (!request) return

    const rawUrls: string[] = request.photoUrls || []
    if (rawUrls.length === 0) return

    const event: RequestPhotosEvent = {
      __type: 'request-photos',
      requestId: serviceRequestId,
      photoUrls: await generatePresignedUrls(rawUrls),
    }
    await appSyncService.publishEvent(REQUEST_UPDATES_CHANNEL, event)
    console.log(`[requestBroadcast] Broadcasted ${rawUrls.length} photo(s) for ${serviceRequestId}`)
  } catch (error) {
    console.error('[requestBroadcast] Error broadcasting request photos:', error)
  }
}

// Status changes that should remove the card from any garage's list — e.g.
// the client cancels, an offer is accepted, or the request is otherwise
// closed. Reason is free-form metadata for logging/UI hints.
export async function broadcastRequestUpdate(
  serviceRequestId: string,
  status: string,
  reason?: string
): Promise<void> {
  try {
    const event: RequestUpdateEvent = {
      __type: 'request-update',
      requestId: serviceRequestId,
      status,
      ...(reason ? { reason } : {}),
    }
    await appSyncService.publishEvent(REQUEST_UPDATES_CHANNEL, event)
    console.log(`[requestBroadcast] Broadcasted update ${serviceRequestId} -> ${status}`)
  } catch (error) {
    console.error('[requestBroadcast] Error broadcasting request update:', error)
  }
}
