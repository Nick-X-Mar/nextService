import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

interface ClientRegisteredEvent {
  clientId: string
  timestamp: string
}

interface CohortRow {
  month: string                // 'YYYY-MM'
  registered: number
  requested1Plus: number       // submitted at least 1 request ever
  requested2Plus: number
  requested3Plus: number
  completed1Plus: number       // had at least 1 service completed
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

async function fetchClientRegistrationsSince(sinceIso: string): Promise<ClientRegisteredEvent[]> {
  const out: ClientRegisteredEvent[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined

  for (let i = 0; i < 50; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: EVENT_LOGS_TABLE,
      IndexName: 'EventNameIndex',
      KeyConditionExpression: 'eventName = :name AND #ts >= :since',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':name': EventName.ClientRegistered,
        ':since': sinceIso
      },
      ProjectionExpression: 'clientId, #ts',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      if (item.clientId && item.timestamp) {
        out.push({
          clientId: item.clientId as string,
          timestamp: item.timestamp as string
        })
      }
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return out
}

async function countClientEvents(clientId: string, eventName: string): Promise<number> {
  let total = 0
  let lastEvaluatedKey: Record<string, unknown> | undefined

  for (let i = 0; i < 5; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: EVENT_LOGS_TABLE,
      IndexName: 'ClientTimelineIndex',
      KeyConditionExpression: 'clientId = :cid',
      FilterExpression: 'eventName = :name',
      ExpressionAttributeValues: {
        ':cid': clientId,
        ':name': eventName
      },
      Select: 'COUNT',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    total += res.Count || 0
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return total
}

interface CohortsResponse {
  months: number
  cohorts: CohortRow[]
}

// 5 min TTL — cohorts is the worst-case endpoint (2 queries per registered
// client). Cache hit means a single Map lookup, otherwise potentially
// thousands of GSI queries.
const cache = createTtlCache<CohortsResponse>(5 * 60_000)

async function computeCohorts(months: number): Promise<CohortsResponse> {
  await ensureEventLogsTable()

  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const sinceIso = since.toISOString()

  const registrations = await fetchClientRegistrationsSince(sinceIso)

  // Group by month
  const cohortGroups = new Map<string, string[]>()
  for (const reg of registrations) {
    const key = monthKey(reg.timestamp)
    if (!cohortGroups.has(key)) cohortGroups.set(key, [])
    cohortGroups.get(key)!.push(reg.clientId)
  }

  // For each cohort, count clients with N+ requests and 1+ completion.
  // Bound concurrency per cohort because a single big cohort could fan out.
  const CONCURRENCY = 25
  const cohorts: CohortRow[] = []

  for (const [month, clientIds] of cohortGroups.entries()) {
    let requested1Plus = 0
    let requested2Plus = 0
    let requested3Plus = 0
    let completed1Plus = 0

    for (let i = 0; i < clientIds.length; i += CONCURRENCY) {
      const slice = clientIds.slice(i, i + CONCURRENCY)
      const results = await Promise.all(slice.map(async (cid) => {
        const [requests, completions] = await Promise.all([
          countClientEvents(cid, EventName.ServiceRequestSubmitted),
          countClientEvents(cid, EventName.ServiceCompleted)
        ])
        return { requests, completions }
      }))
      for (const r of results) {
        if (r.requests >= 1) requested1Plus++
        if (r.requests >= 2) requested2Plus++
        if (r.requests >= 3) requested3Plus++
        if (r.completions >= 1) completed1Plus++
      }
    }

    cohorts.push({
      month,
      registered: clientIds.length,
      requested1Plus,
      requested2Plus,
      requested3Plus,
      completed1Plus
    })
  }

  // Sort newest first
  cohorts.sort((a, b) => b.month.localeCompare(a.month))

  return { months, cohorts }
}

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // How many months back to include. Default: 6.
    const monthsParam = parseInt(searchParams.get('months') || '6', 10)
    const months = Math.max(1, Math.min(24, monthsParam))

    const cacheKey = `months=${months}`
    const data = await cache.getOrCompute(cacheKey, () => computeCohorts(months))

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    })
  } catch (err) {
    console.error('[admin/funnel/cohorts] error:', err)
    return NextResponse.json({ error: 'Failed to compute cohorts' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
