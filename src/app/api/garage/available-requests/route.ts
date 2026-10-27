import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll, decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireActiveGarage } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'
import {
  garageClientView,
  garageVehicleView,
  QUOTING_CLIENT_PROJECTION,
  QUOTING_VEHICLE_NAMES,
  QUOTING_VEHICLE_PROJECTION,
} from '@/utils/garageClientView'

async function _GET(request: NextRequest) {
  try {
    // The feed carries the open market — every pending request, its photos and
    // the client's first name — so a garage an admin has not approved (or has
    // since deactivated) gets a 403 the dashboard turns into its pending screen.
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    logEvent({
      eventName: EventName.GarageViewedAvailableRequests,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      source: 'api/garage/available-requests'
    })

    // Get all pending service requests via StatusIndex GSI, plus this garage's
    // existing offers (to filter them out) — both are independent so run in parallel.
    // The pending-request feed is paginated. The garage's own offers are NOT:
    // they are used to filter already-answered requests out of the feed, so a
    // partial list would make requests the garage has already bid on reappear.
    const { searchParams } = new URL(request.url)

    // The dashboard only needs a number for the tab badge. Hydrating every row
    // with a client lookup, a vehicle lookup and a presigned S3 URL just to call
    // `.length` on the result was the single most expensive thing the garage
    // dashboard did on load — and the count came out wrong anyway, because the
    // feed is paginated and the badge only ever saw the first page.
    if (searchParams.get('countOnly') === '1') {
      const [pendingIds, offers] = await Promise.all([
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
          `available-requests count for ${garageId}`
        ),
        collectAll<{ serviceRequestId?: string }>(
          (startKey) =>
            dynamoDB.send(new QueryCommand({
              TableName: 'Offers',
              IndexName: 'GarageOffersIndex',
              KeyConditionExpression: 'garageId = :garageId',
              ProjectionExpression: 'serviceRequestId',
              ExpressionAttributeValues: { ':garageId': garageId },
              ExclusiveStartKey: startKey,
            })),
          `available-requests count offers for ${garageId}`
        ),
      ])

      const answered = new Set(offers.map((o) => o.serviceRequestId))
      const requestIds = pendingIds
        .map((r) => r.id)
        .filter((id): id is string => !!id && !answered.has(id))

      return NextResponse.json({ success: true, count: requestIds.length, requestIds })
    }

    const [result, garageOffers] = await Promise.all([
      dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': ServiceRequestStatus.PENDING },
        ScanIndexForward: false,
        Limit: parseLimit(searchParams.get('limit'), 20),
        ExclusiveStartKey: decodeCursor(searchParams.get('cursor')),
      })),
      collectAll<{ serviceRequestId?: string }>(
        (startKey) =>
          dynamoDB.send(new QueryCommand({
            TableName: 'Offers',
            IndexName: 'GarageOffersIndex',
            KeyConditionExpression: 'garageId = :garageId',
            ExpressionAttributeValues: { ':garageId': garageId },
            ExclusiveStartKey: startKey,
          })),
        `available-requests offers for ${garageId}`
      )
    ])

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        requests: [],
        nextCursor: encodeCursor(result.LastEvaluatedKey)
      })
    }

    const garageOfferRequestIds = new Set(
      garageOffers.map(offer => offer.serviceRequestId)
    )

    // Filter out requests that this garage has already made offers for
    const availableRequests = result.Items.filter(
      request => !garageOfferRequestIds.has(request.id)
    )

    if (availableRequests.length === 0) {
      return NextResponse.json({
        success: true,
        requests: [],
        nextCursor: encodeCursor(result.LastEvaluatedKey)
      })
    }

    // Batched, and projected down to the quoting view: this feed goes to every
    // active garage, so the client's surname, phone and email and the car's
    // plate, VIN and engine number are not even read. A row missing clientId or
    // vehicleId is skipped by the batch rather than failing the whole feed.
    const [clients, vehicles, presignedByRequest] = await Promise.all([
      batchGetById('Clients', availableRequests.map((r) => r.clientId as string | undefined), {
        projection: QUOTING_CLIENT_PROJECTION,
      }),
      batchGetById('Vehicles', availableRequests.map((r) => r.vehicleId as string | undefined), {
        projection: QUOTING_VEHICLE_PROJECTION,
        names: QUOTING_VEHICLE_NAMES,
      }),
      Promise.all(
        availableRequests.map((request) =>
          request.photoUrls && request.photoUrls.length > 0
            ? generatePresignedUrls(request.photoUrls)
            : Promise.resolve([])
        )
      ),
    ])

    const requestsWithDetails = availableRequests.map((request, i) => ({
      id: request.id,
      description: request.description,
      category: request.category,
      status: request.status,
      createdAt: request.createdAt,
      clientAvailabilityDates: request.clientAvailabilityDates || [],
      photoUrls: presignedByRequest[i],
      estimatedCost: request.estimatedCost ?? null,
      // Nobody has won a pending request, so this is always the quoting view.
      client: garageClientView(clients.get(request.clientId as string), false),
      vehicle: garageVehicleView(vehicles.get(request.vehicleId as string), false),
    }))

    // Filter out requests where we couldn't find client or vehicle details
    const validRequests = requestsWithDetails.filter(
      request => request.client && request.vehicle
    )

    return NextResponse.json({
      success: true,
      requests: validRequests,
      nextCursor: encodeCursor(result.LastEvaluatedKey)
    })

  } catch (error) {
    console.error('Error fetching available requests:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching available requests',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
