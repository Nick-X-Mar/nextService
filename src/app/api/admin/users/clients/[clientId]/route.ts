import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    const [clientResult, vehiclesResult, requestsResult] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: 'Clients',
        Key: { id: clientId }
      })),
      dynamoDB.send(new QueryCommand({
        TableName: 'Vehicles',
        IndexName: 'ClientVehiclesIndex',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId }
      })),
      dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'ClientRequestsIndex',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        Select: 'COUNT'
      }))
    ])

    const client = clientResult.Item
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const vehicles = (vehiclesResult.Items || []).map((v) => ({
      id: v.id,
      make: v.make || v.manufacturer || '',
      model: v.model || '',
      year: v.year || ''
    }))

    return NextResponse.json({
      id: client.id,
      type: 'client',
      email: client.email,
      name: [client.firstName, client.lastName].filter(Boolean).join(' ') || client.email,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phoneNumber || '',
      createdAt: client.createdAt || '',
      vehicles,
      requestCount: requestsResult.Count || 0
    })
  } catch (error) {
    console.error('Admin client detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
