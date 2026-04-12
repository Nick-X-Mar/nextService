import { NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'

// Public endpoint — returns active deals sorted by sortOrder
export async function GET() {
  try {
    await ensureHotDealsTable()

    const result = await dynamoDB.send(new ScanCommand({
      TableName: HOT_DEALS_TABLE_NAME,
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
