import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ServiceRequestStatus } from '@/types/statuses'
import {
  commissionLine,
  resolveCommissionPercent,
  type CommissionLine,
  type CommissionRateSource,
} from '@/lib/commission-basis'

type Row = Record<string, unknown>

export interface BilledJob {
  request: Row
  garageId: string
  line: CommissionLine
  /** The rate this job was billed at, and where it came from. */
  percent: number
  rateSource: CommissionRateSource
}

/**
 * Every completed job of a month that bills commission, with the garage it
 * belongs to and its line. The overview and a garage's detail page are both
 * built from this, so their figures cannot drift apart.
 *
 * A job belongs to the month of its appointment (YYYY-MM of `appointmentDate`,
 * an Athens date), not the day it was closed: a job booked for the 31st and
 * declared on the 2nd is that month's work.
 */
export async function billedJobsForMonth(
  month: string,
  onlyGarageId?: string
): Promise<{ jobs: BilledJob[]; garages: Map<string, Row> }> {
  const completed: Row[] = []
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
      ExpressionAttributeValues: {
        ':status': ServiceRequestStatus.COMPLETED,
        ':monthPrefix': `${month}-`,
      },
      ExclusiveStartKey: lastKey,
    }))
    completed.push(...((result.Items as Row[] | undefined) || []))
    lastKey = result.LastEvaluatedKey
  } while (lastKey)

  // The garage: `acceptedGarageId` on every row booked or closed since it
  // existed; the accepted offer's garage for the older ones. A row resolved
  // through neither is left out — there is nobody to bill.
  const legacyOfferIds = Array.from(new Set(
    completed
      .filter((r) => typeof r.acceptedGarageId !== 'string')
      .map((r) => r.acceptedOfferId)
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

  const owned = completed
    .map((r) => ({ r, garageId: garageOf(r) }))
    .filter((x): x is { r: Row; garageId: string } => !!x.garageId && (!onlyGarageId || x.garageId === onlyGarageId))

  const garages = new Map<string, Row>()
  const garageIds = Array.from(new Set(owned.map((x) => x.garageId)))
  if (onlyGarageId && !garageIds.includes(onlyGarageId)) garageIds.push(onlyGarageId)
  for (const g of await batchGet('Garages', garageIds, 'id, companyName, email, commissionPercent, commissionPercentSetAt, commissionPercentSetBy')) {
    garages.set(g.id as string, g)
  }

  const jobs: BilledJob[] = []
  for (const { r, garageId } of owned) {
    const { percent, source } = resolveCommissionPercent(r, garages.get(garageId))
    const line = commissionLine(r as Parameters<typeof commissionLine>[0], percent)
    if (line) jobs.push({ request: r, garageId, line, percent, rateSource: source })
  }
  return { jobs, garages }
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
