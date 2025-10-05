import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    // Get all messages for this request to find unique garages
    const scanCommand = new ScanCommand({
      TableName: 'ChatMessages',
      FilterExpression: 'requestId = :requestId',
      ExpressionAttributeValues: {
        ':requestId': requestId
      }
    })

    const result = await dynamoDB.send(scanCommand)

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

    // Get garage details
    const garages = []
    for (const garageId of garageIds) {
      const garageScanCommand = new ScanCommand({
        TableName: 'Garages',
        FilterExpression: 'id = :garageId',
        ExpressionAttributeValues: {
          ':garageId': garageId
        }
      })
      
      const garageResult = await dynamoDB.send(garageScanCommand)
      if (garageResult.Items && garageResult.Items.length > 0) {
        const garage = garageResult.Items[0]
        
        // Get last message and unread count for this garage
        const garageMessages = result.Items
          .filter((item: any) => item.senderId === garageId)
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
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
