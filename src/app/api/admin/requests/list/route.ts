import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const cursor = searchParams.get('cursor')

    const fromISO = from ? (from.includes('T') ? from : `${from}T00:00:00.000Z`) : undefined
    const toISO = to ? (to.includes('T') ? to : `${to}T23:59:59.999Z`) : undefined

    let result

    if (status) {
      const keyCondition = fromISO && toISO
        ? '#status = :status AND createdAt BETWEEN :from AND :to'
        : '#status = :status'
      const values: Record<string, string> = { ':status': status }
      if (fromISO && toISO) {
        values[':from'] = fromISO
        values[':to'] = toISO
      }

      result = await dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'StatusIndex',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
      }))
    } else {
      result = await dynamoDB.send(new ScanCommand({
        TableName: 'ServiceRequests',
        ...(fromISO && toISO ? {
          FilterExpression: 'createdAt BETWEEN :from AND :to',
          ExpressionAttributeValues: { ':from': fromISO, ':to': toISO }
        } : {}),
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
      }))
    }

    const requests = result.Items || []

    // Get client names for display
    const clientIds = [...new Set(requests.map((r) => r.clientId).filter(Boolean))]
    let clientMap: Record<string, string> = {}

    if (clientIds.length > 0) {
      const batchResult = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          Clients: {
            Keys: clientIds.slice(0, 100).map((id) => ({ id })),
            ProjectionExpression: 'id, firstName, lastName, email'
          }
        }
      }))

      for (const client of batchResult.Responses?.Clients || []) {
        clientMap[client.id] = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.email
      }
    }

    // Count offers per request
    const offerCounts = await Promise.all(
      requests.slice(0, 50).map((r) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'Offers',
          IndexName: 'ServiceRequestOffersIndex',
          KeyConditionExpression: 'serviceRequestId = :reqId',
          ExpressionAttributeValues: { ':reqId': r.id },
          Select: 'COUNT'
        })).then((res) => ({ id: r.id, count: res.Count || 0 }))
      )
    )

    const offerCountMap: Record<string, number> = {}
    for (const { id, count } of offerCounts) {
      offerCountMap[id] = count
    }

    const items = requests.map((r) => ({
      id: r.id,
      clientName: clientMap[r.clientId] || r.clientId || 'Unknown',
      category: r.serviceCategory || r.category || '-',
      status: r.status,
      createdAt: r.createdAt,
      offerCount: offerCountMap[r.id] ?? 0
    }))

    if (!status) {
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return NextResponse.json({ items, cursor: nextCursor })
  } catch (error) {
    console.error('Request list error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
