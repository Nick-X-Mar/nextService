import { NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensureHotDealsTable } from '@/utils/ensureHotDealsTable'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

// Public endpoint — returns active deals sorted by sortOrder
async function _GET() {
  try {
    await ensureHotDealsTable()

    const result = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.HotDeals,
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': true }
    }))

    const items = (result.Items || []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )

    return NextResponse.json(items)
  } catch {
    // Fallback to empty — the landing page will show nothing or fall back
    return NextResponse.json([])
  }
}

export const GET = withMetrics(_GET)
