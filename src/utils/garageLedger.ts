import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { batchGetById } from '@/utils/batchGetById'
import { collectAll } from '@/utils/pagination'
import { quotingFirstName } from '@/utils/garageClientView'
import { ensureGarageSettlementsTable } from '@/utils/ensureLedgerTables'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import {
  DEFAULT_COMMISSION_PERCENT,
  commissionLine,
  outcomeReviewStatus,
  resolveCommissionPercent,
  sumCents,
} from '@/lib/commission-basis'
import { completionReasonLabel, type CompletionReason } from '@/types/reviews'
import { ServiceRequestStatus } from '@/types/statuses'
import type { GarageLedger, LedgerJob, LedgerJobState, Settlement } from '@/types/settlements'
import { TABLES } from '@/lib/tables'

type Row = Record<string, unknown>

/** Every payment this garage has declared, newest first. */
export async function garageSettlements(garageId: string): Promise<Settlement[]> {
  await ensureGarageSettlementsTable()
  const rows = await collectAll<Row>(
    (startKey) =>
      dynamoDB.send(new QueryCommand({
        TableName: TABLES.GarageSettlements,
        IndexName: 'GarageSettlementsIndex',
        KeyConditionExpression: 'garageId = :garageId',
        ExpressionAttributeValues: { ':garageId': garageId },
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      })),
    `settlements for ${garageId}`
  )
  return rows as unknown as Settlement[]
}

function jobState(r: Row, now: Date): LedgerJobState | null {
  switch (r.status) {
    case ServiceRequestStatus.APPOINTMENT:
    case ServiceRequestStatus.IN_PROGRESS:
      return hasAppointmentStarted(r.appointmentDate as string | undefined, r.appointmentTime as string | undefined, now)
        ? 'awaiting'
        : 'upcoming'
    case ServiceRequestStatus.COMPLETED:
      return r.completionOutcome === 'no_show' || r.completionOutcome === 'not_done' ? 'not_done' : 'completed'
    case ServiceRequestStatus.CANCELLED:
      return 'cancelled'
    default:
      return null
  }
}

/**
 * A garage's books: every job it won, what each one bills, and what it has
 * paid. The commission per job comes from the same `commissionLine` the admin
 * report uses — the declared net when there is one, the quote from the
 * appointment day until then, nothing for a confirmed no-show — so the two
 * pages can never show a garage different figures.
 *
 * The jobs are found through the garage's own offers: a job is the garage's
 * when the request names it as the winner (`acceptedGarageId`), or names one of
 * its offers (`acceptedOfferId`, for rows older than that field). Cancelled
 * bookings stay listed, billing nothing.
 */
export async function garageLedger(garageId: string, now: Date = new Date()): Promise<GarageLedger> {
  const [offers, settlements, garageRes] = await Promise.all([
    collectAll<Row>(
      (startKey) =>
        dynamoDB.send(new QueryCommand({
          TableName: TABLES.Offers,
          IndexName: 'GarageOffersIndex',
          KeyConditionExpression: 'garageId = :garageId',
          ExpressionAttributeValues: { ':garageId': garageId },
          ProjectionExpression: 'id, serviceRequestId',
          ExclusiveStartKey: startKey,
        })),
      `ledger offers for ${garageId}`
    ),
    garageSettlements(garageId),
    dynamoDB.send(new GetCommand({
      TableName: TABLES.Garages,
      Key: { id: garageId },
      ProjectionExpression: 'id, commissionPercent',
    })),
  ])
  const garage = garageRes.Item ?? null
  const ownOfferIds = new Set(offers.map((o) => o.id as string))

  const requests = await batchGetById(TABLES.ServiceRequests, offers.map((o) => o.serviceRequestId as string))
  const won = [...requests.values()].filter((r) =>
    r.acceptedGarageId === garageId ||
    (typeof r.acceptedGarageId !== 'string' && ownOfferIds.has(r.acceptedOfferId as string))
  )

  const [clients, vehicles] = await Promise.all([
    batchGetById(TABLES.Clients, won.map((r) => r.clientId as string | undefined), {
      projection: 'id, firstName, email',
    }),
    batchGetById(TABLES.Vehicles, won.map((r) => r.vehicleId as string | undefined), {
      projection: 'id, brand, #model',
      names: { '#model': 'model' },
    }),
  ])

  const jobs: LedgerJob[] = []
  for (const r of won) {
    const state = jobState(r, now)
    if (!state) continue
    const { percent } = resolveCommissionPercent(r, garage)
    // Upcoming and cancelled bookings bill nothing; the rest go through the
    // admin report's own line.
    const line = state === 'upcoming' || state === 'cancelled'
      ? null
      : commissionLine(r as Parameters<typeof commissionLine>[0], percent)
    const amounts = r.finalAmounts as { net: number; vat: number; gross: number } | undefined
    const vehicle = vehicles.get(r.vehicleId as string)
    const client = clients.get(r.clientId as string)
    const confirmation = r.clientConfirmation as { status?: string } | undefined
    jobs.push({
      requestId: r.id as string,
      state,
      category: r.category as string | undefined,
      appointmentDate: r.appointmentDate as string | undefined,
      appointmentTime: (r.appointmentTime as string | undefined) ?? null,
      vehicle: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') : undefined,
      clientFirstName: client ? quotingFirstName(client) : undefined,
      quoted: typeof r.appointmentPrice === 'number' ? r.appointmentPrice : null,
      declared: amounts ? { net: amounts.net, vat: amounts.vat, gross: amounts.gross } : null,
      reason: completionReasonLabel(r.completionReason as CompletionReason | undefined),
      outcomeReview: outcomeReviewStatus(r as Parameters<typeof outcomeReviewStatus>[0]),
      commission: line?.commission ?? 0,
      commissionPercent: percent,
      commissionBasis: line?.basisAmount ?? 0,
      clientConfirmation:
        confirmation?.status === 'confirmed' || confirmation?.status === 'disputed' ? confirmation.status : null,
    })
  }
  // Newest appointment first; undated rows last.
  jobs.sort((a, b) => (b.appointmentDate ?? '').localeCompare(a.appointmentDate ?? ''))

  const counting = settlements.filter((s) => s.status !== 'rejected')
  const commission = sumCents(jobs.map((j) => j.commission))
  const paid = sumCents(counting.map((s) => s.amount))
  return {
    jobs,
    settlements,
    totals: {
      commission,
      paid,
      paidUnconfirmed: sumCents(counting.filter((s) => s.status === 'declared').map((s) => s.amount)),
      balance: sumCents([commission, -paid]),
    },
    defaultCommissionPercent: DEFAULT_COMMISSION_PERCENT,
  }
}
