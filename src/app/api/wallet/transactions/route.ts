import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ensureWalletTransactionsTable } from '@/utils/ensurePaymentTables'
import { requireClient } from '@/utils/requireAuth'

export async function GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    await ensureWalletTransactionsTable()

    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: process.env.WALLET_TRANSACTIONS_TABLE || 'WalletTransactions',
        IndexName: 'ClientWalletIndex',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false, // newest first
        Limit: 50
      })
    )

    return NextResponse.json({
      success: true,
      transactions: result.Items || []
    })
  } catch (error) {
    console.error('Error fetching wallet transactions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet transactions' },
      { status: 500 }
    )
  }
}
