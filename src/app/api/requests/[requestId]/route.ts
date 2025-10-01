import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    // Get service request details
    const scanCommand = new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: 'id = :requestId',
      ExpressionAttributeValues: {
        ':requestId': requestId
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ 
        error: 'Service request not found' 
      }, { status: 404 })
    }

    const serviceRequest = result.Items[0]

    // Get client details
    const clientScanCommand = new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'id = :clientId',
      ExpressionAttributeValues: {
        ':clientId': serviceRequest.clientId
      }
    })

    const clientResult = await dynamoDB.send(clientScanCommand)
    const client = clientResult.Items?.[0]

    // Get vehicle details
    const vehicleScanCommand = new ScanCommand({
      TableName: 'Vehicles',
      FilterExpression: 'id = :vehicleId',
      ExpressionAttributeValues: {
        ':vehicleId': serviceRequest.vehicleId
      }
    })

    const vehicleResult = await dynamoDB.send(vehicleScanCommand)
    const vehicle = vehicleResult.Items?.[0]

    return NextResponse.json({
      success: true,
      request: {
        id: serviceRequest.id,
        description: serviceRequest.description,
        category: serviceRequest.category,
        urgency: serviceRequest.urgency,
        status: serviceRequest.status,
        createdAt: serviceRequest.createdAt,
        photoUrls: serviceRequest.photoUrls || [],
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

  } catch (error) {
    console.error('Error fetching service request:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching service request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


