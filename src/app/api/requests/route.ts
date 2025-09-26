import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      )
    }

    // Basic validation for clientId format (should start with 'client-')
    if (!clientId.startsWith('client-')) {
      return NextResponse.json(
        { error: 'Invalid client ID format' },
        { status: 400 }
      )
    }

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

          return {
            ...request,
            vehicle: vehicle ? {
              brand: vehicle.brand,
              model: vehicle.model,
              modelYear: vehicle.modelYear
            } : null
          }
        } catch (error) {
          console.error('Error fetching vehicle for request:', request.id, error)
          return {
            ...request,
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
