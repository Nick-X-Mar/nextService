import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const search = searchParams.get('search')?.toLowerCase()
    const cursor = searchParams.get('cursor')

    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Clients',
      Limit: search ? undefined : limit,
      ...(cursor && !search ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
    }))

    let items = (result.Items || []).map((item) => ({
      id: item.id,
      name: [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email,
      email: item.email,
      phone: item.phoneNumber || '',
      createdAt: item.createdAt || ''
    }))

    if (search) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(search) ||
        item.email.toLowerCase().includes(search)
      )
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const nextCursor = result.LastEvaluatedKey && !search
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return NextResponse.json({ items: items.slice(0, limit), cursor: nextCursor })
  } catch (error) {
    console.error('Admin clients list error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
