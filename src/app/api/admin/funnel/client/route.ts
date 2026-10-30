import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'
import { TABLES } from '@/lib/tables'

// The request form, step by step, counted per visitor and day (the server-side
// key in src/utils/visitorKey.ts). Most people fill it in signed out, so counting clientIds
// missed exactly the visitors who leave. What happens after the request is sent
// is the Sankey's job (per request), not this funnel's.
const CLIENT_FUNNEL_STEPS = [
  { key: EventName.VisitStarted,            label: 'Επίσκεψη στο site' },
  { key: EventName.CarDetailsStarted,       label: 'Άνοιξε τη φόρμα αιτήματος' },
  { key: EventName.CarDetailsCompleted,     label: 'Συμπλήρωσε το αυτοκίνητο' },
  { key: EventName.CarSpecsStarted,         label: 'Έφτασε στο τελευταίο βήμα' },
  { key: EventName.ServiceRequestSubmitted, label: 'Έστειλε αίτημα' }
] as const

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

async function visitsWithEvent(
  eventName: string,
  fromIso: string,
  toIso: string
): Promise<Set<string>> {
  const seen = new Set<string>()
  let lastEvaluatedKey: Record<string, unknown> | undefined

  // Paginate to handle high-volume events. Cap iterations to avoid runaway
  // loops on misconfigured indexes.
  for (let i = 0; i < 50; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: TABLES.EventLogs,
      IndexName: 'EventNameIndex',
      KeyConditionExpression: 'eventName = :name AND #ts BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':name': eventName,
        ':from': fromIso,
        ':to': toIso
      },
      ProjectionExpression: 'visitId',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      if (item.visitId) seen.add(item.visitId as string)
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return seen
}

async function computeClientFunnel(fromIso: string, toIso: string): Promise<ClientFunnelResponse> {
  await ensureEventLogsTable()

  const sets = await Promise.all(
    CLIENT_FUNNEL_STEPS.map((step) => visitsWithEvent(step.key, fromIso, toIso))
  )
  // A step counts only the visits that also reached the one before it, so every bar
  // is a subset of the last and the gap between two bars is the people who left there.
  const counts: number[] = []
  let reached = sets[0]
  for (const [i, set] of sets.entries()) {
    if (i > 0) reached = new Set([...set].filter((id) => reached.has(id)))
    counts.push(reached.size)
  }

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
