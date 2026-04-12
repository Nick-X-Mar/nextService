import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const status = searchParams.get('status') || 'all'
    const search = searchParams.get('search')?.toLowerCase()
    const cursor = searchParams.get('cursor')

    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Garages',
      ...(cursor && !search ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
    }))

    let items = (result.Items || []).map((item) => ({
      id: item.id,
      name: item.companyName || item.email,
      email: item.email,
      phone: item.mobile || '',
      createdAt: item.createdAt || '',
      isActive: item.isActive ?? false
    }))

    // Filter by status
    if (status === 'pending') {
      items = items.filter((item) => !item.isActive)
    } else if (status === 'active') {
      items = items.filter((item) => item.isActive)
    }

    // Search filter
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
    console.error('Admin garages list error:', error)
    return NextResponse.json({ error: 'Failed to fetch garages' }, { status: 500 })
  }
}
