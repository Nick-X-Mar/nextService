import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    // Build filter expression
    let filterExpression = 'requestId = :requestId'
    const expressionAttributeValues: any = {
      ':requestId': requestId
    }

    // If garageId is provided, filter messages between client and this specific garage
    if (garageId) {
      filterExpression += ' AND (senderId = :garageId OR senderType = :clientType)'
      expressionAttributeValues[':garageId'] = garageId
      expressionAttributeValues[':clientType'] = 'client'
    }

    // Get all messages for this request
    const scanCommand = new ScanCommand({
      TableName: 'ChatMessages',
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    })

    const result = await dynamoDB.send(scanCommand)

    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({
        success: true,
        messages: []
      })
    }

    // Sort messages by timestamp
    const sortedMessages = result.Items.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return NextResponse.json({
      success: true,
      messages: sortedMessages
    })

  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json(
      { 
        error: 'Error fetching chat messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    const body = await request.json()

    if (!requestId) {
      return NextResponse.json({ 
        error: 'Request ID is required' 
      }, { status: 400 })
    }

    const { message, senderId, senderType, garageId } = body

    if (!message || !senderId || !senderType) {
      return NextResponse.json({ 
        error: 'Message, senderId, and senderType are required' 
      }, { status: 400 })
    }

    if (!['garage', 'client'].includes(senderType)) {
      return NextResponse.json({ 
        error: 'Invalid senderType. Must be "garage" or "client"' 
      }, { status: 400 })
    }

    // Generate unique message ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Get sender name based on type
    let senderName = 'Unknown'
    if (senderType === 'garage') {
      // Get garage name
      const garageScanCommand = new ScanCommand({
        TableName: 'Garages',
        FilterExpression: 'id = :garageId',
        ExpressionAttributeValues: {
          ':garageId': senderId
        }
      })
      const garageResult = await dynamoDB.send(garageScanCommand)
      if (garageResult.Items && garageResult.Items.length > 0) {
        senderName = garageResult.Items[0].companyName
      }
    } else {
      // Get client name
      const clientScanCommand = new ScanCommand({
        TableName: 'Clients',
        FilterExpression: 'id = :clientId',
        ExpressionAttributeValues: {
          ':clientId': senderId
        }
      })
      const clientResult = await dynamoDB.send(clientScanCommand)
      if (clientResult.Items && clientResult.Items.length > 0) {
        const client = clientResult.Items[0]
        senderName = `${client.firstName} ${client.lastName || ''}`.trim()
      }
    }

    // Create message
    const messageData = {
      id: messageId,
      requestId: requestId,
      senderId: senderId,
      senderType: senderType,
      senderName: senderName,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...(garageId && { garageId: garageId })
    }

    const putCommand = new PutCommand({
      TableName: 'ChatMessages',
      Item: messageData
    })

    await dynamoDB.send(putCommand)

    return NextResponse.json({
      success: true,
      message: messageData
    })

  } catch (error) {
    console.error('Error creating chat message:', error)
    return NextResponse.json(
      { 
        error: 'Error creating chat message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


