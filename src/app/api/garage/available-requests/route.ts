import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
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

    // Get all pending service requests
    const scanCommand = new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': ServiceRequestStatus.PENDING
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true, 
        requests: []
      })
    }

    // Get all offers made by this garage to filter out requests they've already offered on
    const offersScanCommand = new ScanCommand({
      TableName: 'Offers',
      FilterExpression: 'garageId = :garageId',
      ExpressionAttributeValues: {
        ':garageId': garageId
      }
    })

    const offersResult = await dynamoDB.send(offersScanCommand)
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

    // For each service request, get client and vehicle details
    const requestsWithDetails = await Promise.all(
      availableRequests.map(async (request) => {
        // Get client details
        const clientScanCommand = new ScanCommand({
          TableName: 'Clients',
          FilterExpression: 'id = :clientId',
          ExpressionAttributeValues: {
            ':clientId': request.clientId
          }
        })

        const clientResult = await dynamoDB.send(clientScanCommand)
        const client = clientResult.Items?.[0]

        // Get vehicle details
        const vehicleScanCommand = new ScanCommand({
          TableName: 'Vehicles',
          FilterExpression: 'id = :vehicleId',
          ExpressionAttributeValues: {
            ':vehicleId': request.vehicleId
          }
        })

        const vehicleResult = await dynamoDB.send(vehicleScanCommand)
        const vehicle = vehicleResult.Items?.[0]

        // Generate presigned URLs for photos
        const rawUrls = request.photoUrls || []
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
