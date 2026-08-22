import { NextRequest, NextResponse } from 'next/server'
import { BatchGetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureReviewsTable, REVIEWS_TABLE_NAME } from '@/utils/ensureReviewsTable'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'
import { decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import type { Review } from '@/types/reviews'

/**
 * Moderation queue.
 *
 * A Scan, deliberately: reviews are filtered by status and direction, neither
 * of which is a key on any index, and the alternative — an index per filter —
 * would cost more than it saves for a table this size. It is bounded by
 * `limit` and resumable by cursor rather than draining the table in one call.
 */
async function _GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureReviewsTable()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const direction = searchParams.get('direction')
    const limit = parseLimit(searchParams.get('limit'), 50)

    const filters: string[] = []
    const names: Record<string, string> = {}
    const values: Record<string, unknown> = {}

    if (status === 'published' || status === 'hidden') {
      filters.push('#status = :status')
      names['#status'] = 'status'
      values[':status'] = status
    }
    if (direction === 'client_to_garage' || direction === 'garage_to_client') {
      filters.push('#direction = :direction')
      names['#direction'] = 'direction'
      values[':direction'] = direction
    }

    const res = await dynamoDB.send(
      new ScanCommand({
        TableName: REVIEWS_TABLE_NAME,
        ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}),
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
        Limit: limit,
        ExclusiveStartKey: decodeCursor(searchParams.get('cursor')),
      })
    )

    const reviews = ((res.Items || []) as Review[]).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )

    // Resolve the names so the queue is readable without opening each row.
    const garageIds = [...new Set(reviews.map((r) => r.garageId).filter(Boolean))]
    const clientIds = [...new Set(reviews.map((r) => r.clientId).filter(Boolean))]
    const names_: Record<string, string> = {}

    if (garageIds.length || clientIds.length) {
      const requestItems: Record<string, { Keys: { id: string }[]; ProjectionExpression: string }> = {}
      if (garageIds.length) {
        requestItems.Garages = {
          Keys: garageIds.slice(0, 100).map((id) => ({ id })),
          ProjectionExpression: 'id, companyName',
        }
      }
      if (clientIds.length) {
        requestItems.Clients = {
          Keys: clientIds.slice(0, 100).map((id) => ({ id })),
          ProjectionExpression: 'id, firstName, lastName',
        }
      }
      const resolved = await dynamoDB.send(new BatchGetCommand({ RequestItems: requestItems }))
      for (const g of resolved.Responses?.Garages || []) {
        names_[g.id] = g.companyName || g.id
      }
      for (const c of resolved.Responses?.Clients || []) {
        names_[c.id] = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.id
      }
    }

    return NextResponse.json({
      reviews: reviews.map((review) => ({
        ...review,
        garageName: names_[review.garageId] || review.garageId,
        clientName: names_[review.clientId] || review.clientId,
      })),
      nextCursor: encodeCursor(res.LastEvaluatedKey),
    })
  } catch (error) {
    console.error('Admin reviews list error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
