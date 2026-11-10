import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { garageCommissionPercent } from '@/lib/commission-basis'
import { collectAll } from '@/utils/pagination'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'
import { businessTypesLabel } from '@/types/businessTypes'

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const status = searchParams.get('status') || 'all'
    const search = searchParams.get('search')?.toLowerCase()

    const garages = await collectAll<Record<string, unknown>>((startKey) => dynamoDB.send(new ScanCommand({
      TableName: TABLES.Garages,
      ExclusiveStartKey: startKey,
    })) as Promise<{ Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> }>, 'admin garages')

    let items = garages.map((item) => ({
      id: String(item.id),
      name: String(item.companyName || item.email || ''),
      email: String(item.email || ''),
      phone: String(item.mobile || ''),
      businessTypes: businessTypesLabel(item.businessTypes),
      createdAt: String(item.createdAt || ''),
      isActive: item.isActive === true,
      commissionPercent: garageCommissionPercent(item),
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

    return NextResponse.json({ items: items.slice(0, limit), total: items.length })
  } catch (error) {
    console.error('Admin garages list error:', error)
    return NextResponse.json({ error: 'Failed to fetch garages' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
