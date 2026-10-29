import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireClientOwner } from '@/app/api/clients/requireClientOwner'
import { withMetrics } from '@/utils/withMetrics'
import { presentVehicle } from '@/app/api/vehicles/vehicleView'
import { TABLES } from '@/lib/tables'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Auth check: only the client can see their vehicles
    const auth = requireClientOwner(request, clientId)
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
      TableName: TABLES.Vehicles,
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

    // Presigned per request: the άδεια photo is a private S3 key, and the form shows
    // it straight back to the customer when they pick this car for a new request.
    const vehicles = await Promise.all(result.Items.map(presentVehicle))

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
