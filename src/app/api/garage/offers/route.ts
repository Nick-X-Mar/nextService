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

    // Get all offers made by this garage
    const scanCommand = new ScanCommand({
      TableName: 'Offers',
      FilterExpression: 'garageId = :garageId',
      ExpressionAttributeValues: {
        ':garageId': garageId
      }
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        offers: []
      })
    }

    // For each offer, get service request, client and vehicle details
    const offersWithDetails = await Promise.all(
      result.Items.map(async (offer) => {
        // Get service request details
        const serviceRequestScanCommand = new ScanCommand({
          TableName: 'ServiceRequests',
          FilterExpression: 'id = :requestId',
          ExpressionAttributeValues: {
            ':requestId': offer.serviceRequestId
          }
        })

        const serviceRequestResult = await dynamoDB.send(serviceRequestScanCommand)
        const serviceRequest = serviceRequestResult.Items?.[0]

        if (!serviceRequest) {
          return null
        }

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

        return {
          id: offer.id,
          serviceRequestId: offer.serviceRequestId,
          price: offer.price,
          currency: offer.currency,
          description: offer.description,
          status: offer.status,
          createdAt: offer.createdAt,
          appointmentDate: offer.appointmentDate,
          appointmentPrice: offer.appointmentPrice,
          serviceRequest: {
            id: serviceRequest.id,
            description: serviceRequest.description,
            category: serviceRequest.category,
            client: client
              ? {
                  firstName: client.firstName,
                  lastName: client.lastName
                }
              : null,
            vehicle: vehicle
              ? {
                  brand: vehicle.brand,
                  model: vehicle.model,
                  year: vehicle.year
                }
              : null
          }
        }
      })
    )

    // Filter out null results (where service request wasn't found)
    const validOffers = offersWithDetails.filter(offer => offer !== null)

    return NextResponse.json({
      success: true,
      offers: validOffers
    })

  } catch (error) {
    console.error('Error fetching garage offers:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching garage offers',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
