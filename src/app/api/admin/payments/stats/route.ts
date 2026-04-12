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

    const fromISO = from ? (from.includes('T') ? from : `${from}T00:00:00.000Z`) : undefined
    const toISO = to ? (to.includes('T') ? to : `${to}T23:59:59.999Z`) : undefined

    const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'Payments'

    const result = await dynamoDB.send(new ScanCommand({
      TableName: PAYMENTS_TABLE,
      ...(fromISO && toISO ? {
        FilterExpression: 'createdAt BETWEEN :from AND :to',
        ExpressionAttributeValues: { ':from': fromISO, ':to': toISO }
      } : {})
    }))

    const payments = result.Items || []

    let totalRevenue = 0
    let paymentCount = 0
    let failedCount = 0

    for (const p of payments) {
      if (p.status === 'succeeded') {
        totalRevenue += p.amount || 0
        paymentCount++
      } else if (p.status === 'failed') {
        failedCount++
      }
    }

    const avgPayment = paymentCount > 0 ? Math.round(totalRevenue / paymentCount) : 0

    return NextResponse.json({
      totalRevenue,
      paymentCount,
      avgPayment,
      failedCount
    })
  } catch (error) {
    console.error('Payment stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch payment stats' }, { status: 500 })
  }
}
