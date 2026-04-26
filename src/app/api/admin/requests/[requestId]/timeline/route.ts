import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEventLogsTable } from '@/utils/ensureEventTables'
import { withMetrics } from '@/utils/withMetrics'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'

interface TimelineEvent {
  eventId: string
  timestamp: string
  eventName: string
  actorType: string
  actorId?: string
  actorName?: string
  source?: string
  metadata?: Record<string, unknown>
}

async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }

    await ensureEventLogsTable()

    // Fetch all events for this request via the RequestTimelineIndex GSI
    // (PK=requestId, SK=timestamp ASC by default).
    const events: TimelineEvent[] = []
    let lastEvaluatedKey: Record<string, unknown> | undefined

    for (let i = 0; i < 10; i++) {
      const res = await dynamoDB.send(new QueryCommand({
        TableName: EVENT_LOGS_TABLE,
        IndexName: 'RequestTimelineIndex',
        KeyConditionExpression: 'requestId = :rid',
        ExpressionAttributeValues: { ':rid': requestId },
        ExclusiveStartKey: lastEvaluatedKey,
        ScanIndexForward: true
      }))
      for (const item of res.Items || []) {
        events.push({
          eventId: item.eventId as string,
          timestamp: item.timestamp as string,
          eventName: item.eventName as string,
          actorType: item.actorType as string,
          actorId: item.actorId as string | undefined,
          source: item.source as string | undefined,
          metadata: item.metadata as Record<string, unknown> | undefined
        })
      }
      if (!res.LastEvaluatedKey) break
      lastEvaluatedKey = res.LastEvaluatedKey
    }

    // Resolve actor display names for unique client/garage actorIds.
    const clientIds = new Set<string>()
    const garageIds = new Set<string>()
    for (const e of events) {
      if (!e.actorId) continue
      if (e.actorType === 'client') clientIds.add(e.actorId)
      else if (e.actorType === 'garage') garageIds.add(e.actorId)
    }

    const [clientLookups, garageLookups] = await Promise.all([
      Promise.all([...clientIds].map((id) =>
        dynamoDB.send(new GetCommand({
          TableName: 'Clients',
          Key: { id },
          ProjectionExpression: 'id, firstName, lastName, email'
        })).then((r) => r.Item).catch(() => null)
      )),
      Promise.all([...garageIds].map((id) =>
        dynamoDB.send(new GetCommand({
          TableName: 'Garages',
          Key: { id },
          ProjectionExpression: 'id, companyName'
        })).then((r) => r.Item).catch(() => null)
      ))
    ])

    const clientNames = new Map<string, string>()
    for (const c of clientLookups) {
      if (!c) continue
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || (c.email as string) || (c.id as string)
      clientNames.set(c.id as string, name)
    }
    const garageNames = new Map<string, string>()
    for (const g of garageLookups) {
      if (!g) continue
      garageNames.set(g.id as string, (g.companyName as string) || (g.id as string))
    }

    for (const e of events) {
      if (!e.actorId) continue
      if (e.actorType === 'client') e.actorName = clientNames.get(e.actorId)
      else if (e.actorType === 'garage') e.actorName = garageNames.get(e.actorId)
      else if (e.actorType === 'admin') e.actorName = 'admin'
      else if (e.actorType === 'system') e.actorName = 'system'
    }

    return NextResponse.json({
      requestId,
      events
    })
  } catch (err) {
    console.error('[admin/requests/timeline] error:', err)
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
