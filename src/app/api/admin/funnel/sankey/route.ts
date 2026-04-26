import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'
import { createTtlCache } from '@/utils/ttlCache'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

// Sankey nodes are the lifecycle states a request can pass through. The link
// values are how many requests transitioned between two adjacent states.
//
// Lifecycle paths we model:
//   ServiceRequestSubmitted →
//     OfferReceived → OfferAccepted → AppointmentScheduled → Completed | Cancelled
//                                                          → (no terminal event)
//                  → OfferRejected (terminal)
//                  → StillPending (terminal — no Accepted/Rejected yet)
//     NoOffers (terminal — never received any OfferCreated)

const NODES = [
  'Νέο Αίτημα',
  'Έλαβε Προσφορά',
  'Καμία Προσφορά',
  'Δέχτηκε',
  'Απορρίφθηκε',
  'Εκκρεμές',
  'Ραντεβού',
  'Ολοκληρώθηκε',
  'Ακυρώθηκε'
] as const

type NodeName = typeof NODES[number]

const NODE_INDEX: Record<NodeName, number> = NODES.reduce((acc, name, i) => {
  acc[name] = i
  return acc
}, {} as Record<NodeName, number>)

interface RequestEvent {
  eventName: string
  timestamp: string
}

async function fetchSubmittedRequestIds(fromIso: string, toIso: string): Promise<string[]> {
  const ids = new Set<string>()
  let lastEvaluatedKey: Record<string, unknown> | undefined

  for (let i = 0; i < 50; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: EVENT_LOGS_TABLE,
      IndexName: 'EventNameIndex',
      KeyConditionExpression: 'eventName = :name AND #ts BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':name': EventName.ServiceRequestSubmitted,
        ':from': fromIso,
        ':to': toIso
      },
      ProjectionExpression: 'requestId',
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      if (item.requestId) ids.add(item.requestId as string)
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return [...ids]
}

async function fetchRequestTimeline(requestId: string): Promise<RequestEvent[]> {
  const events: RequestEvent[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined

  for (let i = 0; i < 5; i++) {
    const res = await dynamoDB.send(new QueryCommand({
      TableName: EVENT_LOGS_TABLE,
      IndexName: 'RequestTimelineIndex',
      KeyConditionExpression: 'requestId = :rid',
      ExpressionAttributeValues: { ':rid': requestId },
      ProjectionExpression: 'eventName, #ts',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExclusiveStartKey: lastEvaluatedKey
    }))
    for (const item of res.Items || []) {
      events.push({
        eventName: item.eventName as string,
        timestamp: item.timestamp as string
      })
    }
    if (!res.LastEvaluatedKey) break
    lastEvaluatedKey = res.LastEvaluatedKey
  }

  return events
}

interface PathDecision {
  receivedOffer: boolean
  acceptedOffer: boolean
  rejectedOffer: boolean
  scheduled: boolean
  completed: boolean
  cancelled: boolean
}

function decidePath(events: RequestEvent[]): PathDecision {
  const has = (name: string) => events.some((e) => e.eventName === name)
  return {
    receivedOffer: has(EventName.OfferCreated),
    acceptedOffer: has(EventName.OfferAccepted),
    rejectedOffer: has(EventName.OfferRejected),
    scheduled: has(EventName.AppointmentScheduled),
    completed: has(EventName.ServiceCompleted),
    cancelled: has(EventName.AppointmentCancelled) || has(EventName.ServiceCancelled)
  }
}

interface SankeyResponse {
  from: string
  to: string
  totalRequests: number
  nodes: { name: string }[]
  links: { source: number; target: number; value: number }[]
}

// 5 min TTL — sankey is the heaviest endpoint (per-request lookups), cache
// hit means a single Map lookup instead of N+1 dynamo queries.
const cache = createTtlCache<SankeyResponse>(5 * 60_000)

async function computeSankey(fromIso: string, toIso: string): Promise<SankeyResponse> {
  await ensureEventLogsTable()

  const requestIds = await fetchSubmittedRequestIds(fromIso, toIso)

  // Bound concurrency so we don't fan out hundreds of queries at once.
  const CONCURRENCY = 20
  const decisions: PathDecision[] = []
  for (let i = 0; i < requestIds.length; i += CONCURRENCY) {
    const slice = requestIds.slice(i, i + CONCURRENCY)
    const events = await Promise.all(slice.map(fetchRequestTimeline))
    decisions.push(...events.map(decidePath))
  }

  // Aggregate transitions
  const linksMap = new Map<string, number>()
  const addLink = (from: NodeName, to: NodeName) => {
    const key = `${NODE_INDEX[from]}->${NODE_INDEX[to]}`
    linksMap.set(key, (linksMap.get(key) || 0) + 1)
  }

  for (const d of decisions) {
    if (d.receivedOffer) {
      addLink('Νέο Αίτημα', 'Έλαβε Προσφορά')
      if (d.acceptedOffer) {
        addLink('Έλαβε Προσφορά', 'Δέχτηκε')
        addLink('Δέχτηκε', 'Ραντεβού')
        if (d.completed) addLink('Ραντεβού', 'Ολοκληρώθηκε')
        else if (d.cancelled) addLink('Ραντεβού', 'Ακυρώθηκε')
      } else if (d.rejectedOffer) {
        addLink('Έλαβε Προσφορά', 'Απορρίφθηκε')
      } else {
        addLink('Έλαβε Προσφορά', 'Εκκρεμές')
      }
    } else {
      addLink('Νέο Αίτημα', 'Καμία Προσφορά')
    }
  }

  const links = [...linksMap.entries()].map(([key, value]) => {
    const [source, target] = key.split('->').map(Number)
    return { source, target, value }
  })

  return {
    from: fromIso,
    to: toIso,
    totalRequests: requestIds.length,
    nodes: NODES.map((name) => ({ name })),
    links
  }
}

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    // Default: last 30 days. Sankey is more meaningful with a wider window,
    // but per-request lookups make this the heaviest endpoint, so we cap.
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fromIso = fromParam ? `${fromParam}T00:00:00.000Z` : defaultFrom.toISOString()
    const toIso = toParam ? `${toParam}T23:59:59.999Z` : now.toISOString()

    const cacheKey = `${fromIso}|${toIso}`
    const data = await cache.getOrCompute(cacheKey, () => computeSankey(fromIso, toIso))

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' }
    })
  } catch (err) {
    console.error('[admin/funnel/sankey] error:', err)
    return NextResponse.json({ error: 'Failed to compute lifecycle sankey' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
