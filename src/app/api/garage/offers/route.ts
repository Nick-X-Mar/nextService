import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { getByIdOrNull } from '@/utils/getById'
import { requireGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    // Get all offers made by this garage via the GarageOffersIndex GSI
    const result = await dynamoDB.send(new QueryCommand({
      TableName: 'Offers',
      IndexName: 'GarageOffersIndex',
      KeyConditionExpression: 'garageId = :garageId',
      ExpressionAttributeValues: { ':garageId': garageId },
      ScanIndexForward: false
    }))

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        offers: []
      })
    }

    // For each offer, get service request first, then client + vehicle in parallel.
    const offersWithDetails = await Promise.all(
      result.Items.map(async (offer) => {
        const serviceRequestResult = await dynamoDB.send(new GetCommand({
          TableName: 'ServiceRequests',
          Key: { id: offer.serviceRequestId }
        }))
        const serviceRequest = serviceRequestResult.Item

        if (!serviceRequest) {
          return null
        }

        // Tolerates a request row missing clientId/vehicleId — one such row used
        // to fail this whole Promise.all and blank the garage's offers tab.
        const [client, vehicle] = await Promise.all([
          getByIdOrNull('Clients', serviceRequest.clientId as string | undefined),
          getByIdOrNull('Vehicles', serviceRequest.vehicleId as string | undefined),
        ])

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
          clientAvailabilityDates: offer.clientAvailabilityDates || [],
          serviceRequest: {
            id: serviceRequest.id,
            description: serviceRequest.description,
            category: serviceRequest.category,
            // The dashboard needs these to tell an appointment still waiting on
            // the garage's confirmation from one that has already been closed.
            status: serviceRequest.status,
            completedAt: serviceRequest.completedAt,
            completionOutcome: serviceRequest.completionOutcome,
            finalAmounts: serviceRequest.finalAmounts,
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
                  year: vehicle.modelYear || vehicle.year
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
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
