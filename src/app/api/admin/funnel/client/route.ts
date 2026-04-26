import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

// Ordered list of steps in the client journey. Each step is a single
// EventName fired once we believe the client has reached that stage.
// Counted as unique clientId per event in the time window.
const CLIENT_FUNNEL_STEPS = [
  { key: 'category_selected',                  label: 'Επιλογή Κατηγορίας' },
  { key: 'car_details_completed',              label: 'Συμπλήρωση Στοιχείων Αυτοκινήτου' },
  { key: 'service_request_submitted',          label: 'Υποβολή Αιτήματος' },
  { key: 'client_availability_dates_submitted',label: 'Δήλωση Διαθεσιμότητας' },
  { key: 'offer_accepted',                     label: 'Αποδοχή Προσφοράς' },
  { key: 'payment_succeeded',                  label: 'Επιτυχής Πληρωμή' },
  { key: 'service_completed',                  label: 'Ολοκλήρωση Υπηρεσίας' }
] as const

// Verify our hardcoded keys still exist on EventName so a typo here
// would fail to compile rather than silently return 0 forever.
const _typeCheck: ReadonlyArray<typeof EventName[keyof typeof EventName]> = [
  EventName.CategorySelected,
  EventName.CarDetailsCompleted,
  EventName.ServiceRequestSubmitted,
  EventName.ClientAvailabilityDatesSubmitted,
  EventName.OfferAccepted,
  EventName.PaymentSucceeded,
  EventName.ServiceCompleted
]
void _typeCheck

interface FunnelStepResult {
  key: string
  label: string
  count: number
  percentOfFirst: number
  percentOfPrev: number
}

interface ClientFunnelResponse {
  from: string
  to: string
  steps: FunnelStepResult[]
}

// 5 min TTL — admin analytics tolerate stale data well, this cuts repeat
// loads and tab-switch refreshes down to ~free.
const cache = createTtlCache<ClientFunnelResponse>(5 * 60_000)

async function countUniqueClientsForEvent(
  eventName: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const seen = new Set<string>()
  let lastEvaluatedKey: Record<string, unknown> | undefined

  // Paginate to handle high-volume events. Cap iterations to avoid runaway
  // loops on misconfigured indexes.
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
      ProjectionExpression: 'clientId',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      if (item.clientId) seen.add(item.clientId as string)
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return seen.size
}

async function computeClientFunnel(fromIso: string, toIso: string): Promise<ClientFunnelResponse> {
  await ensureEventLogsTable()

  const counts = await Promise.all(
    CLIENT_FUNNEL_STEPS.map((step) =>
      countUniqueClientsForEvent(step.key, fromIso, toIso)
    )
  )

  const firstCount = counts[0] || 0
  const steps: FunnelStepResult[] = CLIENT_FUNNEL_STEPS.map((step, i) => {
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

    // Default: last 7 days, inclusive end-of-day.
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fromIso = fromParam ? `${fromParam}T00:00:00.000Z` : defaultFrom.toISOString()
    const toIso = toParam ? `${toParam}T23:59:59.999Z` : now.toISOString()

    const cacheKey = `${fromIso}|${toIso}`
    const data = await cache.getOrCompute(cacheKey, () => computeClientFunnel(fromIso, toIso))

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    })
  } catch (err) {
    console.error('[admin/funnel/client] error:', err)
    return NextResponse.json({ error: 'Failed to compute client funnel' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
