import { NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { ServiceRequestStatus } from '@/types/statuses'

export async function GET() {
  try {
    await ensureEmailLogsTable()

    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Run all queries in parallel
    const [
      clientsResult,
      garagesResult,
      emailsSentResult,
      emailsFailedResult,
      customVehiclesResult,
      ...statusResults
    ] = await Promise.all([
      // Total clients
      dynamoDB.send(new ScanCommand({ TableName: 'Clients', Select: 'COUNT' })),
      // Total garages (with active/pending breakdown)
      dynamoDB.send(new ScanCommand({ TableName: 'Garages', Select: 'ALL_ATTRIBUTES' })),
      // Emails sent last 24h
      dynamoDB.send(new QueryCommand({
        TableName: 'EmailLogs',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status AND sentAt >= :since',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'sent', ':since': oneDayAgo },
        Select: 'COUNT'
      })),
      // Emails failed last 24h
      dynamoDB.send(new QueryCommand({
        TableName: 'EmailLogs',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status AND sentAt >= :since',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'failed', ':since': oneDayAgo },
        Select: 'COUNT'
      })),
      // Custom vehicles (brand or model "other")
      dynamoDB.send(new ScanCommand({
        TableName: 'Vehicles',
        FilterExpression: 'isBrandOther = :true OR isModelOther = :true',
        ExpressionAttributeValues: { ':true': true },
        Select: 'COUNT'
      })),
      // Service requests by status
      ...Object.values(ServiceRequestStatus).map((status) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'ServiceRequests',
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          Select: 'COUNT'
        }))
      )
    ])

    const garages = garagesResult.Items || []
    const activeGarages = garages.filter((g) => g.isActive).length
    const pendingGarages = garages.filter((g) => !g.isActive).length

    const requestsByStatus: Record<string, number> = {}
    let totalRequests = 0
    Object.values(ServiceRequestStatus).forEach((status, i) => {
      const count = statusResults[i].Count || 0
      requestsByStatus[status] = count
      totalRequests += count
    })

    return NextResponse.json({
      totalClients: clientsResult.Count || 0,
      totalGarages: garages.length,
      activeGarages,
      pendingGarages,
      emailsSent24h: emailsSentResult.Count || 0,
      emailsFailed24h: emailsFailedResult.Count || 0,
      requestsByStatus,
      totalRequests,
      customVehicles: customVehiclesResult.Count || 0
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
