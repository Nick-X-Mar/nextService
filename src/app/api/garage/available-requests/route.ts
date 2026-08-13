import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { collectAll, decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireGarage } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
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

    // For each service request, get client + vehicle details + presigned URLs
    // — all three are independent so fetch them in parallel.
    const requestsWithDetails = await Promise.all(
      availableRequests.map(async (request) => {
        const [clientResult, vehicleResult, presignedUrls] = await Promise.all([
          dynamoDB.send(new GetCommand({
            TableName: 'Clients',
            Key: { id: request.clientId }
          })),
          dynamoDB.send(new GetCommand({
            TableName: 'Vehicles',
            Key: { id: request.vehicleId }
          })),
          (request.photoUrls && request.photoUrls.length > 0)
            ? generatePresignedUrls(request.photoUrls)
            : Promise.resolve([])
        ])

        const client = clientResult.Item
        const vehicle = vehicleResult.Item

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
            phoneNumber: client.phoneNumber
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
            isTurbo: vehicle.isTurbo
          } : null
        }
      })
    )

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
