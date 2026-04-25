// Helper for fan-out of service-request lifecycle events to garage dashboards
// over AppSync. Centralises the channel names, payload shape, and the
// enrichment (client + vehicle + presigned photo URLs) so that callers in API
// routes only need to provide the request id.
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { generatePresignedUrls } from '@/utils/s3Service'
import appSyncService from '@/lib/appsync-service'

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

interface BroadcastRequest {
  id: string
  description?: string
  category: string
  status: string
  createdAt: string
  clientAvailabilityDates?: string[]
  photoUrls: string[]
  client: {
    firstName?: string
    lastName?: string
    phoneNumber?: string
  } | null
  vehicle: {
    brand?: string
    model?: string
    year?: string
    licensePlate?: string
    modelYear?: string
    engineCC?: string
    fuelType?: string
    isAutomatic?: boolean
    is4x4?: boolean
    isTurbo?: boolean
  } | null
}

async function loadById(table: string, id: string) {
  const res = await dynamoDB.send(new ScanCommand({
    TableName: table,
    FilterExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id }
  }))
  return res.Items?.[0]
}

// Look up everything a garage dashboard card needs to render, mirroring the
// shape returned by /api/garage/available-requests.
async function buildBroadcastRequest(serviceRequestId: string): Promise<BroadcastRequest | null> {
  const request = await loadById('ServiceRequests', serviceRequestId)
  if (!request) return null

  const [client, vehicle] = await Promise.all([
    request.clientId ? loadById('Clients', request.clientId) : Promise.resolve(null),
    request.vehicleId ? loadById('Vehicles', request.vehicleId) : Promise.resolve(null),
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
    client: client ? {
      firstName: client.firstName,
      lastName: client.lastName,
      phoneNumber: client.phoneNumber,
    } : null,
    vehicle: vehicle ? {
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      modelYear: vehicle.modelYear,
      engineCC: vehicle.engineCC,
      fuelType: vehicle.fuelType,
      isAutomatic: vehicle.isAutomatic,
      is4x4: vehicle.is4x4,
      isTurbo: vehicle.isTurbo,
    } : null,
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
