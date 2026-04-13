import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const fromISO = from ? (from.includes('T') ? from : `${from}T00:00:00.000Z`) : undefined
    const toISO = to ? (to.includes('T') ? to : `${to}T23:59:59.999Z`) : undefined

    // Query each status in parallel
    const statusQueries = Object.values(ServiceRequestStatus).map((status) => {
      const keyCondition = fromISO && toISO
        ? '#status = :status AND createdAt BETWEEN :from AND :to'
        : '#status = :status'
      const values: Record<string, string> = { ':status': status }
      if (fromISO && toISO) {
        values[':from'] = fromISO
        values[':to'] = toISO
      }

      return dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'StatusIndex',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
        Select: 'COUNT'
      }))
    })

    const results = await Promise.all(statusQueries)

    const byStatus: Record<string, number> = {}
    let total = 0
    Object.values(ServiceRequestStatus).forEach((status, i) => {
      const count = results[i].Count || 0
      byStatus[status] = count
      total += count
    })

    // Build funnel metrics
    const created = total
    const offered = (byStatus[ServiceRequestStatus.APPOINTMENT] || 0) +
                    (byStatus[ServiceRequestStatus.IN_PROGRESS] || 0) +
                    (byStatus[ServiceRequestStatus.COMPLETED] || 0)
    const accepted = (byStatus[ServiceRequestStatus.APPOINTMENT] || 0) +
                     (byStatus[ServiceRequestStatus.IN_PROGRESS] || 0) +
                     (byStatus[ServiceRequestStatus.COMPLETED] || 0)
    const completed = byStatus[ServiceRequestStatus.COMPLETED] || 0

    return NextResponse.json({
      total,
      byStatus,
      funnel: { created, offered, accepted, completed }
    })
  } catch (error) {
    console.error('Request stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch request stats' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
