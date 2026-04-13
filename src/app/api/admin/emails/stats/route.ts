import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    await ensureEmailLogsTable()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString()
    const to = searchParams.get('to') || new Date().toISOString()

    // Normalize dates to ISO
    const fromISO = from.includes('T') ? from : `${from}T00:00:00.000Z`
    const toISO = to.includes('T') ? to : `${to}T23:59:59.999Z`

    const statuses = ['sent', 'failed', 'queued', 'skipped', 'bounced']

    // Query each status in parallel
    const statusCounts = await Promise.all(
      statuses.map((status) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'EmailLogs',
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status AND sentAt BETWEEN :from AND :to',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ':from': fromISO, ':to': toISO },
          Select: 'COUNT'
        }))
      )
    )

    const byStatus: Record<string, number> = {}
    let total = 0
    statuses.forEach((status, i) => {
      const count = statusCounts[i].Count || 0
      byStatus[status] = count
      total += count
    })

    // Get template breakdown by scanning the date range
    const scanResult = await dynamoDB.send(new ScanCommand({
      TableName: 'EmailLogs',
      FilterExpression: 'sentAt BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':from': fromISO, ':to': toISO },
      ProjectionExpression: 'templateName'
    }))

    const byTemplate: Record<string, number> = {}
    for (const item of scanResult.Items || []) {
      const name = item.templateName || 'unknown'
      byTemplate[name] = (byTemplate[name] || 0) + 1
    }

    return NextResponse.json({ byStatus, byTemplate, total })
  } catch (error) {
    console.error('Email stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch email stats' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
