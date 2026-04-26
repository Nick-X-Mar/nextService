import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const clientId = requireClient(request)
    if (clientId instanceof NextResponse) return clientId

    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json({
        error: 'Request ID is required'
      }, { status: 400 })
    }

    // Verify the client owns this request
    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item || requestResult.Item.clientId !== clientId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    // Get all messages for this request via the RequestMessagesIndex GSI
    const result = await dynamoDB.send(new QueryCommand({
      TableName: 'ChatMessages',
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :requestId',
      ExpressionAttributeValues: { ':requestId': requestId }
    }))

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        garages: []
      })
    }

    // Get unique garage IDs from messages
    const garageIds = [...new Set(
      result.Items
        .filter((item: any) => item.senderType === 'garage')
        .map((item: any) => item.senderId)
    )]

    if (garageIds.length === 0) {
      return NextResponse.json({
        success: true,
        garages: []
      })
    }

    // Get garage details — fetch all garages in parallel
    const garageResults = await Promise.all(
      garageIds.map((garageId) =>
        dynamoDB.send(new GetCommand({
          TableName: 'Garages',
          Key: { id: garageId }
        }))
      )
    )

    const garages: Array<{
      id: string
      companyName: string
      logoUrl?: string
      lastMessage?: string
      lastMessageTime?: string
      hasUnreadMessages: boolean
    }> = []

    for (const garageResult of garageResults) {
      const garage = garageResult.Item
      if (!garage) continue

      // Get last message and unread count for this garage
      const garageMessages = result.Items
        .filter((item: any) => item.senderId === garage.id)
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      const lastMessage = garageMessages[0]

      // Get the last time client read messages from this garage
      const lastReadByClient = garage.lastReadByClient || garage.createdAt

      // Check if there are any unread messages from garage
      const hasUnreadMessages = garageMessages.some((msg: any) =>
        msg.senderType === 'garage' &&
        new Date(msg.timestamp).getTime() > new Date(lastReadByClient).getTime()
      )

      garages.push({
        id: garage.id,
        companyName: garage.companyName,
        logoUrl: garage.logoUrl,
        lastMessage: lastMessage?.message,
        lastMessageTime: lastMessage?.timestamp,
        hasUnreadMessages: hasUnreadMessages
      })
    }

    // Sort garages by last message time (most recent first)
    garages.sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0
      if (!a.lastMessageTime) return 1
      if (!b.lastMessageTime) return -1
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    })

    return NextResponse.json({
      success: true,
      garages
    })

  } catch (error) {
    console.error('Error fetching garages:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching garages',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
