import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'
import { randomUUID } from 'crypto'

// GET — list all deals (sorted by sortOrder)
export async function GET() {
  try {
    await ensureHotDealsTable()

    const result = await dynamoDB.send(new ScanCommand({
      TableName: HOT_DEALS_TABLE_NAME
    }))

    const items = (result.Items || []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Hot deals list error:', error)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// POST — create new deal
export async function POST(request: NextRequest) {
  try {
    await ensureHotDealsTable()

    const body = await request.json()
    const now = new Date().toISOString()
    const dealId = `deal-${randomUUID()}`

    // Generate slug from title
    const slug = (body.title || 'deal')
      .toLowerCase()
      .replace(/[^a-zα-ωά-ώ0-9]+/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    const deal = {
      dealId,
      title: body.title || '',
      subtitle: body.subtitle || '',
      description: body.description || '',
      price: body.price || '',
      priceNum: body.priceNum || 0,
      image: body.image || '',
      icon: body.icon || 'build',
      details: body.details || [],
      duration: body.duration || '',
      category: body.category || 'service',
      workType: body.workType || '',
      slug,
      popular: body.popular ?? true,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 999,
      createdAt: now,
      updatedAt: now
    }

    await dynamoDB.send(new PutCommand({
      TableName: HOT_DEALS_TABLE_NAME,
      Item: deal
    }))

    return NextResponse.json({ success: true, deal })
  } catch (error) {
    console.error('Hot deals create error:', error)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
}
