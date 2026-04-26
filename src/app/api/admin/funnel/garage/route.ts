import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

const GARAGE_FUNNEL_STEPS = [
  { key: 'garage_registered',                label: 'Εγγραφή Συνεργείου' },
  { key: 'garage_validated',                 label: 'Έγκριση από Admin' },
  { key: 'garage_viewed_available_requests', label: 'Είδε Διαθέσιμα Αιτήματα' },
  { key: 'offer_created',                    label: 'Υποβολή Προσφοράς' },
  { key: 'offer_accepted',                   label: 'Αποδοχή Προσφοράς' }
] as const

const _typeCheck: ReadonlyArray<typeof EventName[keyof typeof EventName]> = [
  EventName.GarageRegistered,
  EventName.GarageValidated,
  EventName.GarageViewedAvailableRequests,
  EventName.OfferCreated,
  EventName.OfferAccepted
]
void _typeCheck

interface FunnelStepResult {
  key: string
  label: string
  count: number
  percentOfFirst: number
  percentOfPrev: number
}

interface GarageFunnelResponse {
  from: string
  to: string
  steps: FunnelStepResult[]
}

const cache = createTtlCache<GarageFunnelResponse>(5 * 60_000)

async function countUniqueGaragesForEvent(
  eventName: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const seen = new Set<string>()
  let lastEvaluatedKey: Record<string, unknown> | undefined

  for (let i = 0; i < 50; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: EVENT_LOGS_TABLE,
      IndexName: 'EventNameIndex',
      KeyConditionExpression: 'eventName = :name AND #ts BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':name': eventName,
        ':from': fromIso,
        ':to': toIso
      },
      ProjectionExpression: 'garageId',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      if (item.garageId) seen.add(item.garageId as string)
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return seen.size
}

async function computeGarageFunnel(fromIso: string, toIso: string): Promise<GarageFunnelResponse> {
  await ensureEventLogsTable()

  const counts = await Promise.all(
    GARAGE_FUNNEL_STEPS.map((step) =>
      countUniqueGaragesForEvent(step.key, fromIso, toIso)
    )
  )

  const firstCount = counts[0] || 0
  const steps: FunnelStepResult[] = GARAGE_FUNNEL_STEPS.map((step, i) => {
    const count = counts[i]
    const prevCount = i === 0 ? count : counts[i - 1]
    return {
      key: step.key,
      label: step.label,
      count,
      percentOfFirst: firstCount > 0 ? Math.round((count / firstCount) * 1000) / 10 : 0,
      percentOfPrev: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 0
    }
  })

  return { from: fromIso, to: toIso, steps }
}

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fromIso = fromParam ? `${fromParam}T00:00:00.000Z` : defaultFrom.toISOString()
    const toIso = toParam ? `${toParam}T23:59:59.999Z` : now.toISOString()

    const cacheKey = `${fromIso}|${toIso}`
    const data = await cache.getOrCompute(cacheKey, () => computeGarageFunnel(fromIso, toIso))

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    })
  } catch (err) {
    console.error('[admin/funnel/garage] error:', err)
    return NextResponse.json({ error: 'Failed to compute garage funnel' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
