import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { requireClient } from '@/utils/requireAuth'

export async function GET(request: NextRequest) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const result = await dynamoDB.send(
      new GetCommand({ TableName: 'Clients', Key: { id: clientId } })
    )

    const points = (result.Item?.walletBalance as number) ?? 0

    return NextResponse.json({ success: true, points })
  } catch (error) {
    console.error('Error fetching wallet balance:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet balance' },
      { status: 500 }
    )
  }
}
