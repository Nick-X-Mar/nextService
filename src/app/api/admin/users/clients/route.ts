import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { collectAll } from '@/utils/pagination'
import { foldText } from '@/utils/searchText'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 25

type Row = Record<string, string>
type ScanPage = { Items?: Row[]; LastEvaluatedKey?: Record<string, unknown> }

/** Every client, newest first: a page of a raw Scan is an arbitrary few. */
async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '', 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const search = foldText(searchParams.get('search')?.trim() || '')
    const digits = search.replace(/\D/g, '')

    const [clients, requests] = await Promise.all([
      collectAll<Row>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.Clients,
        ProjectionExpression: 'id, firstName, lastName, email, phoneNumber, createdAt',
        ExclusiveStartKey: startKey,
      })) as Promise<ScanPage>, 'admin clients'),
      collectAll<Row>((startKey) => dynamoDB.send(new ScanCommand({
        TableName: TABLES.ServiceRequests,
        ProjectionExpression: 'clientId',
        ExclusiveStartKey: startKey,
      })) as Promise<ScanPage>, 'admin client requests'),
    ])

    const requestCounts = new Map<string, number>()
    for (const r of requests) requestCounts.set(r.clientId, (requestCounts.get(r.clientId) ?? 0) + 1)

    const items = clients
      .map((item) => ({
        id: item.id,
        name: [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email || 'Guest',
        email: item.email || '',
        phone: item.phoneNumber || '',
        createdAt: item.createdAt || '',
        requestCount: requestCounts.get(item.id) ?? 0,
      }))
      .filter((item) => {
        if (!search) return true
        return foldText(`${item.name} ${item.email} ${item.phone}`).includes(search)
          || (digits.length >= 3 && item.phone.replace(/\D/g, '').includes(digits))
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const lastPage = Math.max(1, Math.ceil(items.length / pageSize))
    const page = Math.min(Math.max(parseInt(searchParams.get('page') || '', 10) || 1, 1), lastPage)

    return NextResponse.json({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Admin clients list error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
