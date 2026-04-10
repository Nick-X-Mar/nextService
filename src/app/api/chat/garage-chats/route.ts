import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { requireGarage } from '@/utils/requireAuth'

export async function GET(request: NextRequest) {
  try {
    const garageId = requireGarage(request)
    if (garageId instanceof NextResponse) return garageId

    // Find all chat messages where this garage is involved
    const messagesResult = await dynamoDB.send(new ScanCommand({
      TableName: 'ChatMessages',
      FilterExpression: 'garageId = :garageId',
      ExpressionAttributeValues: { ':garageId': garageId }
    }))

    const messages = messagesResult.Items || []

    if (messages.length === 0) {
      return NextResponse.json({ success: true, requestIds: [] })
    }

    // Get unique request IDs
    const requestIds = [...new Set(messages.map((m: any) => m.requestId as string))]

    return NextResponse.json({ success: true, requestIds })
  } catch (error) {
    console.error('Error fetching garage chats:', error)
    return NextResponse.json(
      { error: 'Error fetching garage chats' },
      { status: 500 }
    )
  }
}
