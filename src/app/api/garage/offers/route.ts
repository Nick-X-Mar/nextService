import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { requireActiveGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { garageClientView, isWinningGarage } from '@/utils/garageClientView'

async function _GET(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    // Every offer this garage has made, via GarageOffersIndex. Drained in full:
    // the dashboard splits this one list into the offers and appointments tabs
    // and their badges, so a page boundary would silently drop appointments.
    const items = await collectAll<Record<string, unknown>>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'Offers',
          IndexName: 'GarageOffersIndex',
          KeyConditionExpression: 'garageId = :garageId',
          ExpressionAttributeValues: { ':garageId': garageId },
          ScanIndexForward: false,
          ExclusiveStartKey: startKey,
        })),
      `garage offers for ${garageId}`
    )

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        offers: []
      })
    }

    // Batched rather than three point reads per offer: the dashboard fetches
    // this list for its badges and again for whichever tab is open. Rows
    // missing clientId/vehicleId are skipped by the batch, not fatal to it.
    const requests = await batchGetById('ServiceRequests', items.map((o) => o.serviceRequestId as string))
    const requestRows = [...requests.values()]
    const [clients, vehicles] = await Promise.all([
      batchGetById('Clients', requestRows.map((r) => r.clientId as string | undefined), {
        projection: 'id, firstName, lastName, phoneNumber, email',
      }),
      batchGetById('Vehicles', requestRows.map((r) => r.vehicleId as string | undefined), {
        projection: 'id, brand, #model, #year, modelYear, licensePlate',
        names: { '#model': 'model', '#year': 'year' },
      }),
    ])

    // Rows booked before `acceptedGarageId` existed name the winner only through
    // `acceptedOfferId`; if that is one of this garage's own offers, it won.
    const ownOfferIds = new Set(items.map((o) => o.id as string))

    const offersWithDetails = items.map((offer) => {
      const serviceRequest = requests.get(offer.serviceRequestId as string)
      if (!serviceRequest) {
        return null
      }

      const client = clients.get(serviceRequest.clientId as string)
      const vehicle = vehicles.get(serviceRequest.vehicleId as string)

      // The client's surname, phone, email and plate are for the garage that
      // won the job, which has to call them and receive the car — not for every
      // garage that bid, and not for the winner of a booking that was cancelled.
      const legacyWinner = ownOfferIds.has(serviceRequest.acceptedOfferId as string) ? garageId : null
      const isWinner = isWinningGarage(serviceRequest, garageId, legacyWinner)

      // Offers rows carry `offerAmount`; the `price`/`currency`/`description`
      // this used to return have never existed on them, which is why the
      // offers tab showed blank prices.
      return {
        id: offer.id,
        serviceRequestId: offer.serviceRequestId,
        offerNumber: offer.offerNumber,
        offerAmount: offer.offerAmount,
        benefits: offer.benefits || [],
        availabilityDates: offer.availabilityDates || [],
        status: offer.status,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
        appointmentDate: offer.appointmentDate,
        appointmentTime: offer.appointmentTime ?? null,
        appointmentPrice: offer.appointmentPrice,
        clientAvailabilityDates: offer.clientAvailabilityDates || [],
        serviceRequest: {
          id: serviceRequest.id,
          description: serviceRequest.description,
          category: serviceRequest.category,
          // The dashboard needs these to tell an appointment still waiting on
          // the garage's confirmation from one that has already been closed.
          status: serviceRequest.status,
          // Opaque: with `status`, tells an offer that lost before a cancel from
          // a booking that was cancelled (garageOfferState), and names no garage.
          acceptedOfferId: serviceRequest.acceptedOfferId ?? null,
          // How the job closed and what was charged belong to the garage that
          // did it; a garage that lost must not read a competitor's invoice.
          ...(isWinner
            ? {
                completedAt: serviceRequest.completedAt,
                completionOutcome: serviceRequest.completionOutcome,
                finalAmounts: serviceRequest.finalAmounts,
              }
            : {}),
          client: garageClientView(client, isWinner),
          vehicle: vehicle
            ? {
                brand: vehicle.brand,
                model: vehicle.model,
                year: vehicle.modelYear || vehicle.year,
                // The winner is the one who receives the car.
                ...(isWinner && vehicle.licensePlate ? { licensePlate: vehicle.licensePlate } : {}),
              }
            : null
        }
      }
    })

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
