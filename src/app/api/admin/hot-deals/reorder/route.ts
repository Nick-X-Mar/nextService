import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'

// POST — reorder deals: body = { order: ["dealId1", "dealId2", ...] }
export async function POST(request: NextRequest) {
  try {
    await ensureHotDealsTable()

    const { order } = await request.json() as { order: string[] }

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'order must be an array' }, { status: 400 })
    }

    await Promise.all(
      order.map((dealId, index) =>
        dynamoDB.send(new UpdateCommand({
          TableName: HOT_DEALS_TABLE_NAME,
          Key: { dealId },
          UpdateExpression: 'SET sortOrder = :order',
          ExpressionAttributeValues: { ':order': index }
        }))
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Hot deals reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}
