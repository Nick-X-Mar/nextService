import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensurePaymentsTable } from '@/utils/ensurePaymentTables'

export async function GET(request: NextRequest) {
  try {
    await ensurePaymentsTable()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const cursor = searchParams.get('cursor')

    const fromISO = from ? (from.includes('T') ? from : `${from}T00:00:00.000Z`) : undefined
    const toISO = to ? (to.includes('T') ? to : `${to}T23:59:59.999Z`) : undefined

    const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'Payments'

    const filterParts: string[] = []
    const exprValues: Record<string, string | boolean> = {}

    if (fromISO && toISO) {
      filterParts.push('createdAt BETWEEN :from AND :to')
      exprValues[':from'] = fromISO
      exprValues[':to'] = toISO
    }

    if (status) {
      filterParts.push('#status = :status')
      exprValues[':status'] = status
    }

    const result = await dynamoDB.send(new ScanCommand({
      TableName: PAYMENTS_TABLE,
      ...(filterParts.length > 0 ? {
        FilterExpression: filterParts.join(' AND '),
        ExpressionAttributeValues: exprValues,
        ...(status ? { ExpressionAttributeNames: { '#status': 'status' } } : {})
      } : {}),
      Limit: limit,
      ...(cursor ? { ExclusiveStartKey: JSON.parse(Buffer.from(cursor, 'base64').toString()) } : {})
    }))

    const items = (result.Items || []).map((p) => ({
      paymentId: p.paymentId,
      clientId: p.clientId,
      amount: p.amount || 0,
      status: p.status,
      createdAt: p.createdAt,
      description: p.description || ''
    }))

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return NextResponse.json({ items, cursor: nextCursor })
  } catch (error) {
    console.error('Payment list error:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}
