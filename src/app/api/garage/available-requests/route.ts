import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
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
    const [result, offersResult] = await Promise.all([
      dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': ServiceRequestStatus.PENDING },
        ScanIndexForward: false
      })),
      dynamoDB.send(new QueryCommand({
        TableName: 'Offers',
        IndexName: 'GarageOffersIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId }
      }))
    ])

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        requests: []
      })
    }

    const garageOfferRequestIds = new Set(
      offersResult.Items?.map(offer => offer.serviceRequestId) || []
    )

    // Filter out requests that this garage has already made offers for
    const availableRequests = result.Items.filter(
      request => !garageOfferRequestIds.has(request.id)
    )

    if (availableRequests.length === 0) {
      return NextResponse.json({
        success: true,
        requests: []
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
      requests: validRequests
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
