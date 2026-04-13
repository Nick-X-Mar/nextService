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
    const status = searchParams.get('status')
    const template = searchParams.get('template')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const cursor = searchParams.get('cursor')

    const fromISO = from.includes('T') ? from : `${from}T00:00:00.000Z`
    const toISO = to.includes('T') ? to : `${to}T23:59:59.999Z`

    let result

    if (status) {
      // Use StatusIndex
      result = await dynamoDB.send(new QueryCommand({
        TableName: 'EmailLogs',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status AND sentAt BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':from': fromISO, ':to': toISO },
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
      }))
    } else if (template) {
      // Use TemplateIndex
      result = await dynamoDB.send(new QueryCommand({
        TableName: 'EmailLogs',
        IndexName: 'TemplateIndex',
        KeyConditionExpression: 'templateName = :template AND sentAt BETWEEN :from AND :to',
        ExpressionAttributeValues: { ':template': template, ':from': fromISO, ':to': toISO },
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
      }))
    } else {
      // Full scan with date filter
      result = await dynamoDB.send(new ScanCommand({
        TableName: 'EmailLogs',
        FilterExpression: 'sentAt BETWEEN :from AND :to',
        ExpressionAttributeValues: { ':from': fromISO, ':to': toISO },
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
      }))
    }

    const items = (result.Items || []).map((item) => ({
      emailId: item.emailId,
      recipient: item.to,
      templateName: item.templateName,
      status: item.status,
      sentAt: item.sentAt,
      error: item.error
    }))

    // Sort by sentAt descending if not already from Query
    if (!status && !template) {
      items.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    }

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return NextResponse.json({ items, cursor: nextCursor })
  } catch (error) {
    console.error('Email list error:', error)
    return NextResponse.json({ error: 'Failed to fetch email list' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
