import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'

// GET — single deal
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    await ensureHotDealsTable()
    const { dealId } = await params

    const result = await dynamoDB.send(new GetCommand({
      TableName: HOT_DEALS_TABLE_NAME,
      Key: { dealId }
    }))

    if (!result.Item) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    return NextResponse.json(result.Item)
  } catch (error) {
    console.error('Hot deal get error:', error)
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 })
  }
}

// PUT — update deal
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    await ensureHotDealsTable()
    const { dealId } = await params
    const body = await request.json()

    const fields = [
      'title', 'subtitle', 'description', 'price', 'priceNum',
      'image', 'icon', 'details', 'duration', 'category',
      'workType', 'slug', 'popular', 'isActive', 'sortOrder'
    ]

    const updateParts: string[] = ['updatedAt = :now']
    const values: Record<string, unknown> = { ':now': new Date().toISOString() }
    const names: Record<string, string> = {}

    for (const field of fields) {
      if (body[field] !== undefined) {
        const placeholder = `:${field}`
        const nameAlias = `#${field}`
        updateParts.push(`${nameAlias} = ${placeholder}`)
        values[placeholder] = body[field]
        names[nameAlias] = field
      }
    }

    await dynamoDB.send(new UpdateCommand({
      TableName: HOT_DEALS_TABLE_NAME,
      Key: { dealId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {})
    }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Hot deal update error:', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}

// DELETE — remove deal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    await ensureHotDealsTable()
    const { dealId } = await params

    await dynamoDB.send(new DeleteCommand({
      TableName: HOT_DEALS_TABLE_NAME,
      Key: { dealId }
    }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Hot deal delete error:', error)
    return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 })
  }
}
