import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ServiceRequestStatus } from '@/types/statuses'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import {
  commissionLine,
  outcomeReviewStatus,
  resolveCommissionPercent,
  type CommissionLine,
  type CommissionRateSource,
  type OutcomeReviewStatus,
} from '@/lib/commission-basis'

type Row = Record<string, unknown>

export interface BilledJob {
  request: Row
  garageId: string
  line: CommissionLine
  /** The rate this job was billed at, and where it came from. */
  percent: number
  rateSource: CommissionRateSource
  /**
   * The appointment day has come and the garage has not said how it went.
   * Billed on the agreed price until it does.
   */
  undeclared: boolean
}

/** A job the garage closed as not having happened, waiting on (or past) an admin's check. */
export interface FlaggedJob {
  request: Row
  garageId: string
  reviewStatus: OutcomeReviewStatus
  percent: number
}

/**
 * Every job of a month that bills commission, with the garage it belongs to
 * and its line — plus the jobs a garage said did not happen, for review. The
 * overview and a garage's detail page are both built from this, so their
 * figures cannot drift apart.
 *
 * Billing starts on the appointment day: a booking whose slot has started is
 * billed on the agreed price even before the garage declares anything, and on
 * the declared amount once it does. A garage that never declares therefore
 * still owes the commission.
 *
 * A job belongs to the month of its appointment (YYYY-MM of `appointmentDate`,
 * an Athens date), not the day it was closed.
 */
export async function billedJobsForMonth(
  month: string,
  onlyGarageId?: string,
  now: Date = new Date()
): Promise<{ jobs: BilledJob[]; flagged: FlaggedJob[]; garages: Map<string, Row> }> {
  const [completed, booked] = await Promise.all([
    monthRows(ServiceRequestStatus.COMPLETED, month),
    monthRows(ServiceRequestStatus.APPOINTMENT, month),
  ])
  const due = booked.filter((r) =>
    hasAppointmentStarted(r.appointmentDate as string | undefined, r.appointmentTime as string | undefined, now)
  )
  const candidates = [
    ...completed.map((r) => ({ r, undeclared: false })),
    ...due.map((r) => ({ r, undeclared: true })),
  ]

  // The garage: `acceptedGarageId` on every row booked or closed since it
  // existed; the accepted offer's garage for the older ones. A row resolved
  // through neither is left out — there is nobody to bill.
  const legacyOfferIds = Array.from(new Set(
    candidates
      .filter(({ r }) => typeof r.acceptedGarageId !== 'string')
      .map(({ r }) => r.acceptedOfferId)
      .filter((v): v is string => typeof v === 'string')
  ))
  const offerToGarage = new Map<string, string>()
  for (const offer of await batchGet('Offers', legacyOfferIds, 'id, garageId')) {
    if (typeof offer.garageId === 'string') offerToGarage.set(offer.id as string, offer.garageId)
  }
  const garageOf = (r: Row): string | undefined =>
    typeof r.acceptedGarageId === 'string'
      ? r.acceptedGarageId
      : offerToGarage.get(r.acceptedOfferId as string)

  const owned = candidates
    .map((c) => ({ ...c, garageId: garageOf(c.r) }))
    .filter((x): x is { r: Row; undeclared: boolean; garageId: string } =>
      !!x.garageId && (!onlyGarageId || x.garageId === onlyGarageId))

  const garages = new Map<string, Row>()
  const garageIds = Array.from(new Set(owned.map((x) => x.garageId)))
  if (onlyGarageId && !garageIds.includes(onlyGarageId)) garageIds.push(onlyGarageId)
  for (const g of await batchGet('Garages', garageIds, 'id, companyName, email, commissionPercent, commissionPercentSetAt, commissionPercentSetBy')) {
    garages.set(g.id as string, g)
  }

  const jobs: BilledJob[] = []
  const flagged: FlaggedJob[] = []
  for (const { r, undeclared, garageId } of owned) {
    const { percent, source } = resolveCommissionPercent(r, garages.get(garageId))
    const review = outcomeReviewStatus(r as Parameters<typeof outcomeReviewStatus>[0])
    if (review) flagged.push({ request: r, garageId, reviewStatus: review, percent })
    const line = commissionLine(r as Parameters<typeof commissionLine>[0], percent)
    if (line) jobs.push({ request: r, garageId, line, percent, rateSource: source, undeclared })
  }
  return { jobs, flagged, garages }
}

/** One status's rows for a month, every page of them. */
async function monthRows(status: string, month: string): Promise<Row[]> {
  const rows: Row[] = []
  let lastKey: Record<string, unknown> | undefined
  do {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: 'ServiceRequests',
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      FilterExpression:
        'begins_with(appointmentDate, :monthPrefix) AND ' +
        '(attribute_exists(appointmentPrice) OR attribute_exists(finalAmounts))',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status, ':monthPrefix': `${month}-` },
      ExclusiveStartKey: lastKey,
    }))
    rows.push(...((result.Items as Row[] | undefined) || []))
    lastKey = result.LastEvaluatedKey
  } while (lastKey)
  return rows
}

/** BatchGet in pages of 100, retrying whatever DynamoDB hands back unprocessed. */
async function batchGet(table: string, ids: string[], projection: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let i = 0; i < ids.length; i += 100) {
    let keys: Record<string, unknown>[] | undefined = ids.slice(i, i + 100).map((id) => ({ id }))
    for (let attempt = 0; keys && keys.length > 0; attempt++) {
      if (attempt === 5) throw new Error(`[commissions] ${table}: unprocessed keys after retries`)
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt))
      const res = await dynamoDB.send(new BatchGetCommand({
        RequestItems: { [table]: { Keys: keys, ProjectionExpression: projection } },
      }))
      rows.push(...((res.Responses?.[table] as Row[] | undefined) || []))
      keys = res.UnprocessedKeys?.[table]?.Keys as Record<string, unknown>[] | undefined
    }
  }
  return rows
}
