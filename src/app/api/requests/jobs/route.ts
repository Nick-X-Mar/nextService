import { NextRequest, NextResponse } from 'next/server'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import { completionReasonLabel, type ClientConfirmation, type CompletionReason } from '@/types/reviews'
import { ServiceRequestStatus } from '@/types/statuses'
import type { LedgerJobState } from '@/types/settlements'
import type { ClientJob } from '@/types/clientJobs'
import { TABLES } from '@/lib/tables'

type Row = Record<string, unknown>

function stateOf(r: Row): LedgerJobState | null {
  switch (r.status) {
    case ServiceRequestStatus.APPOINTMENT:
    case ServiceRequestStatus.IN_PROGRESS:
      return hasAppointmentStarted(r.appointmentDate as string | undefined, r.appointmentTime as string | undefined)
        ? 'awaiting'
        : 'upcoming'
    case ServiceRequestStatus.COMPLETED:
      return r.completionOutcome === 'no_show' || r.completionOutcome === 'not_done' ? 'not_done' : 'completed'
    case ServiceRequestStatus.CANCELLED:
      // Only a cancelled booking is a job; a request cancelled before any offer was accepted is not.
      return typeof r.acceptedOfferId === 'string' ? 'cancelled' : null
    default:
      return null
  }
}

/**
 * The client's Πληρωμές page: every request that became a booking, with the
 * garage (its Δήμος, never its address — see garageClientView), the quote,
 * what the garage declared it charged, and the client's own confirmation.
 * Nothing here is owed to NextService: the client pays the garage directly.
 */
async function _GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const rows = await collectAll<Row>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: TABLES.ServiceRequests,
          IndexName: 'ClientRequestsIndex',
          KeyConditionExpression: 'clientId = :clientId',
          ExpressionAttributeValues: { ':clientId': clientId },
          ScanIndexForward: false,
          ExclusiveStartKey: startKey,
        })),
      `jobs of ${clientId}`
    )
    const booked = rows
      .map((r) => ({ r, state: stateOf(r) }))
      .filter((x): x is { r: Row; state: LedgerJobState } => x.state !== null)

    // The garage: `acceptedGarageId`, or the accepted offer's for older rows.
    const legacy = booked
      .filter(({ r }) => typeof r.acceptedGarageId !== 'string')
      .map(({ r }) => r.acceptedOfferId as string | undefined)
    const offers = await batchGetById(TABLES.Offers, legacy, { projection: 'id, garageId' })
    const garageOf = (r: Row): string | undefined =>
      typeof r.acceptedGarageId === 'string'
        ? r.acceptedGarageId
        : (offers.get(r.acceptedOfferId as string)?.garageId as string | undefined)

    const [garages, vehicles] = await Promise.all([
      batchGetById(TABLES.Garages, booked.map(({ r }) => garageOf(r)), {
        projection: 'id, companyName, municipality',
      }),
      batchGetById(TABLES.Vehicles, booked.map(({ r }) => r.vehicleId as string | undefined), {
        projection: 'id, brand, #model',
        names: { '#model': 'model' },
      }),
    ])

    const jobs: ClientJob[] = booked.map(({ r, state }) => {
      const garage = garages.get(garageOf(r) ?? '')
      const vehicle = vehicles.get(r.vehicleId as string)
      const amounts = r.finalAmounts as { net: number; vat: number; gross: number } | undefined
      const confirmation = r.clientConfirmation as ClientConfirmation | undefined
      const reason = r.completionReason as CompletionReason | undefined
      return {
        requestId: r.id as string,
        state,
        category: r.category as string | undefined,
        appointmentDate: r.appointmentDate as string | undefined,
        appointmentTime: (r.appointmentTime as string | undefined) ?? null,
        vehicle: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') : undefined,
        garage: garage
          ? { companyName: garage.companyName as string | undefined, municipality: garage.municipality as string | undefined }
          : null,
        quoted: typeof r.appointmentPrice === 'number' ? r.appointmentPrice : null,
        declared: amounts ? { net: amounts.net, vat: amounts.vat, gross: amounts.gross } : null,
        // The not-done reason is the client's business; why the garage charged less is too.
        reason: completionReasonLabel(reason),
        confirmation: confirmation
          ? {
              status: confirmation.status,
              ...(typeof confirmation.amountPaid === 'number' ? { amountPaid: confirmation.amountPaid } : {}),
              ...(confirmation.note ? { note: confirmation.note } : {}),
            }
          : null,
        canConfirm: (state === 'completed' || state === 'not_done') && !confirmation,
      }
    })
    jobs.sort((a, b) => (b.appointmentDate ?? '').localeCompare(a.appointmentDate ?? ''))

    return NextResponse.json({ success: true, jobs })
  } catch (error) {
    console.error('Error loading client jobs:', error)
    return NextResponse.json({ error: 'Σφάλμα φόρτωσης' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
