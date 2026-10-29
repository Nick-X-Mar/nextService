import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { requireGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import type { BookedJob, GarageAccountState } from '@/types/bookedJobs'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import {
  QUOTING_CLIENT_PROJECTION,
  QUOTING_VEHICLE_NAMES,
  QUOTING_VEHICLE_PROJECTION,
  isWinningGarage,
  quotingFirstName,
} from '@/utils/garageClientView'
import { TABLES } from '@/lib/tables'

/**
 * The jobs a garage has already booked and not yet closed, for a garage that
 * is no longer allowed on the marketplace.
 *
 * Deactivating a garage does not cancel its bookings, and `complete` lets the
 * assigned garage close them whatever its status — otherwise the jobs stay in
 * APPOINTMENT forever: no commission, no review, and the client cannot cancel
 * once the slot has started. But every dashboard route is `requireActiveGarage`,
 * so a deactivated garage had no screen to do it from. This is that screen's
 * data, behind `requireGarage` on purpose.
 *
 * It returns only what closing the job needs: when, which car, the agreed
 * price, and the client's first name to recognise it by. An inactive garage
 * gets nothing else client-related — no surname, phone, plate or άδεια.
 *
 * `account` tells the dashboard which screen to show: admin deactivation sets
 * `deactivatedAt` (activation removes it), so a garage still awaiting its first
 * approval is `pending`, not `deactivated`.
 */
async function _GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    const garage = (await dynamoDB.send(new GetCommand({
      TableName: TABLES.Garages,
      Key: { id: garageId },
      ProjectionExpression: 'isActive, deactivatedAt',
    }))).Item
    if (!garage) {
      return NextResponse.json({ error: 'Το συνεργείο δεν βρέθηκε' }, { status: 404 })
    }
    const account: GarageAccountState =
      garage.isActive === true ? 'active' : garage.deactivatedAt ? 'deactivated' : 'pending'

    const offers = await collectAll<Record<string, unknown>>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: TABLES.Offers,
          IndexName: 'GarageOffersIndex',
          KeyConditionExpression: 'garageId = :garageId',
          FilterExpression: '#status = :accepted',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':garageId': garageId, ':accepted': OfferStatus.ACCEPTED },
          ExclusiveStartKey: startKey,
        })),
      `booked jobs for ${garageId}`
    )
    if (offers.length === 0) {
      return NextResponse.json({ success: true, account, jobs: [] })
    }

    const requests = await batchGetById(TABLES.ServiceRequests, offers.map((o) => o.serviceRequestId as string))
    const ownOfferIds = new Set(offers.map((o) => o.id as string))

    // Still booked with this garage: an accepted offer can outlive its booking
    // (an admin cancel, an older row), so the request decides, not the offer.
    const open = [...requests.values()].filter((r) => {
      if (r.status !== ServiceRequestStatus.APPOINTMENT) return false
      const legacyWinner = !r.acceptedGarageId && ownOfferIds.has(String(r.acceptedOfferId)) ? garageId : null
      return isWinningGarage(r, garageId, legacyWinner)
    })
    if (open.length === 0) {
      return NextResponse.json({ success: true, account, jobs: [] })
    }

    const [clients, vehicles] = await Promise.all([
      batchGetById(TABLES.Clients, open.map((r) => r.clientId as string | undefined), {
        projection: QUOTING_CLIENT_PROJECTION,
      }),
      batchGetById(TABLES.Vehicles, open.map((r) => r.vehicleId as string | undefined), {
        projection: QUOTING_VEHICLE_PROJECTION,
        names: QUOTING_VEHICLE_NAMES,
      }),
    ])
    const offerByRequest = new Map(offers.map((o) => [o.serviceRequestId as string, o]))

    const jobs: BookedJob[] = open
      .map((r) => {
        const offer = offerByRequest.get(r.id as string)
        const client = clients.get(r.clientId as string)
        const vehicle = vehicles.get(r.vehicleId as string)
        const price =
          typeof r.appointmentPrice === 'number' ? r.appointmentPrice
            : typeof offer?.offerAmount === 'number' ? offer.offerAmount
              : null
        return {
          requestId: r.id as string,
          category: String(r.category ?? ''),
          appointmentDate: String(r.appointmentDate ?? offer?.appointmentDate ?? ''),
          appointmentTime: (r.appointmentTime ?? offer?.appointmentTime ?? null) as string | null,
          price,
          vehicle: vehicle
            ? {
                brand: vehicle.brand as string | undefined,
                model: vehicle.model as string | undefined,
                modelYear: (vehicle.modelYear ?? vehicle.year) as string | undefined,
              }
            : null,
          ...(client && quotingFirstName(client) ? { clientFirstName: quotingFirstName(client) } : {}),
        }
      })
      .filter((job) => job.appointmentDate)
      .sort((a, b) =>
        `${a.appointmentDate}T${a.appointmentTime ?? '00:00'}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime ?? '00:00'}`)
      )

    return NextResponse.json({ success: true, account, jobs })
  } catch (error) {
    console.error('Booked jobs error:', error)
    return NextResponse.json({ error: 'Δεν ήταν δυνατή η φόρτωση των ραντεβού' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
