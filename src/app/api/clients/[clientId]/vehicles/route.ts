import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireOwner } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Auth check: only the client can see their vehicles
    const auth = requireOwner(request, clientId)
    if (auth instanceof NextResponse) return auth

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

    // Query vehicles by clientId using the ClientVehiclesIndex
    const queryCommand = new QueryCommand({
      TableName: 'Vehicles',
      IndexName: 'ClientVehiclesIndex',
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
        vehicles: []
      })
    }

    // Return vehicle data
    const vehicles = result.Items.map((vehicle) => ({
      id: vehicle.id,
      clientId: vehicle.clientId,
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
      nickname: vehicle.nickname,
      licensePhotoUrl: vehicle.licensePhotoUrl,
      isActive: vehicle.isActive,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt
    }))

    return NextResponse.json({
      success: true,
      vehicles: vehicles
    })

  } catch (error) {
    console.error('Error fetching vehicles:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση των οχημάτων',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
