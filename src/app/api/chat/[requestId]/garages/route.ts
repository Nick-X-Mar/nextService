import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireClient } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { collectAll } from '@/utils/pagination'

interface ChatMessageItem {
  id: string
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName?: string
  message: string
  timestamp: string
  garageId?: string
}

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

    const clientReadAt = (requestResult.Item.clientReadAt || {}) as Record<string, string>

    // Every message on the request, but only the five attributes this endpoint
    // actually reads.
    //
    // This used to be an unprojected Query with no Limit and no pagination,
    // which is two bugs at once: it pulled whole message bodies and attachment
    // arrays across the wire — and it is what the client chat's loading
    // spinner waits on — while also silently stopping at DynamoDB's 1MB page,
    // so a long thread quietly lost the garages further back in its history.
    const messages = (await collectAll<Record<string, unknown>>(
      (startKey) => dynamoDB.send(new QueryCommand({
        TableName: 'ChatMessages',
        IndexName: 'RequestMessagesIndex',
        KeyConditionExpression: 'requestId = :requestId',
        ExpressionAttributeValues: { ':requestId': requestId },
        // `timestamp` is a DynamoDB reserved word.
        ProjectionExpression: 'id, senderId, senderType, #msg, #ts',
        ExpressionAttributeNames: { '#ts': 'timestamp', '#msg': 'message' },
        ExclusiveStartKey: startKey,
      })),
      `chat-garages:${requestId}`
    )) as unknown as ChatMessageItem[]

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        garages: []
      })
    }

    const garageIds = [...new Set(
      messages
        .filter((item) => item.senderType === 'garage')
        .map((item) => item.senderId)
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
      const garageMessages = messages
        .filter((item) => item.senderId === garage.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      const lastMessage = garageMessages[0]

      // Read state is per (request, garage) — see the note in mark-read.
      // Absent entry means this client has never opened the thread, so every
      // garage message counts as unread.
      const lastRead = clientReadAt[garage.id]

      const hasUnreadMessages = garageMessages.some((msg) =>
        msg.senderType === 'garage' &&
        (!lastRead || new Date(msg.timestamp).getTime() > new Date(lastRead).getTime())
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
    }, {
      headers: { 'Cache-Control': 'no-store, private' },
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
