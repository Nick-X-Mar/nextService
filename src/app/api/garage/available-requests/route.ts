import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(request: NextRequest) {
  try {
    // Get garage ID from query parameters
    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')

    if (!garageId) {
      return NextResponse.json({ 
        error: 'Garage ID is required' 
      }, { status: 400 })
    }

    // Get all pending service requests
    const scanCommand = new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'pending'
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        requests: []
      })
    }

    // For each service request, get client and vehicle details
    const requestsWithDetails = await Promise.all(
      result.Items.map(async (request) => {
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

        return {
          id: request.id,
          description: request.description,
          category: request.category,
          urgency: request.urgency,
          status: request.status,
          createdAt: request.createdAt,
          photoUrls: request.photoUrls || [],
          client: client ? {
            firstName: client.firstName,
            lastName: client.lastName,
            phoneNumber: client.phoneNumber
          } : null,
          vehicle: vehicle ? {
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.licensePlate
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
