import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireClient } from '@/utils/requireAuth'
import { generatePresignedUrls } from '@/utils/s3Service'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    // Query service requests by clientId using the ClientRequestsIndex
    const queryCommand = new QueryCommand({
      TableName: 'ServiceRequests',
      IndexName: 'ClientRequestsIndex',
      KeyConditionExpression: 'clientId = :clientId',
      ExpressionAttributeValues: {
        ':clientId': clientId
      },
      ScanIndexForward: false // Sort by createdAt descending (latest first)
    })

    const result = await dynamoDB.send(queryCommand)
    
    if (!result.Items) {
      return NextResponse.json({
        success: true,
        requests: []
      })
    }

    // For each service request, get the vehicle information
    const requestsWithVehicles = await Promise.all(
      result.Items.map(async (request) => {
        try {
          // Get vehicle information
          const vehicleQuery = new QueryCommand({
            TableName: 'Vehicles',
            KeyConditionExpression: 'id = :vehicleId',
            ExpressionAttributeValues: {
              ':vehicleId': request.vehicleId
            }
          })

          const vehicleResult = await dynamoDB.send(vehicleQuery)
          const vehicle = vehicleResult.Items?.[0]

          const vehicleData = vehicle
            ? {
                brand: vehicle.brand,
                model: vehicle.model,
                modelYear: vehicle.modelYear,
                engineCC: vehicle.engineCC,
                fuelType: vehicle.fuelType,
                isAutomatic: vehicle.isAutomatic,
                is4x4: vehicle.is4x4,
                isTurbo: vehicle.isTurbo,
                licensePlate: vehicle.licensePlate,
                engineNumber: vehicle.engineNumber,
                vinNumber: vehicle.vinNumber,
                color: vehicle.color,
                nickname: vehicle.nickname
              }
            : null

          // Generate presigned URLs for photos
          const rawUrls = request.photoUrls || []
          const presignedPhotoUrls = rawUrls.length > 0
            ? await generatePresignedUrls(rawUrls)
            : []

          return {
            ...request,
            photoUrls: presignedPhotoUrls,
            clientAvailabilityDates: request.clientAvailabilityDates || [],
            vehicle: vehicleData
          }
        } catch (error) {
          console.error('Error fetching vehicle for request:', request.id, error)
          return {
            ...request,
            clientAvailabilityDates: request.clientAvailabilityDates || [],
            vehicle: null
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      requests: requestsWithVehicles
    })

  } catch (error) {
    console.error('Error fetching requests:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση των αιτημάτων',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
