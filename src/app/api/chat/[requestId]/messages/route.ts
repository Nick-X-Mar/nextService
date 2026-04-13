import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import appSyncService from '@/lib/appsync-service'
import { ScanCommand as RequestsScanCommand } from '@aws-sdk/lib-dynamodb'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkMessageRate = createRateLimiter('chat-message', 60, 3600000)

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { requestId } = await params
    const { searchParams } = new URL(request.url)
    const garageId = searchParams.get('garageId')

    if (!requestId) {
      return NextResponse.json({
        error: 'Request ID is required'
      }, { status: 400 })
    }

    // Verify the user has access to this request
    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    // Clients can only view their own requests' chats
    if (auth.userType === 'client' && requestResult.Item.clientId !== auth.userId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    // Build filter expression
    let filterExpression = 'requestId = :requestId'
    const expressionAttributeValues: any = {
      ':requestId': requestId
    }

    // If garageId is provided, filter messages between client and this specific garage
    if (garageId) {
      filterExpression += ' AND (senderId = :garageId OR (senderType = :clientType AND (garageId = :garageId OR attribute_not_exists(garageId))))'
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
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!checkMessageRate(auth.userId)) {
      return NextResponse.json(
        { error: 'Πολλά μηνύματα. Δοκιμάστε ξανά αργότερα.' },
        { status: 429 }
      )
    }

    const { requestId } = await params
    const body = await request.json()

    if (!requestId) {
      return NextResponse.json({
        error: 'Request ID is required'
      }, { status: 400 })
    }

    // Verify the user has access to this request
    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (auth.userType === 'client' && requestResult.Item.clientId !== auth.userId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    const { message, garageId } = body
    // Use authenticated user as sender instead of trusting body
    const senderId = auth.userId
    const senderType = auth.userType

    // If garageId is not provided but senderType is garage, use senderId as garageId
    const effectiveGarageId = garageId || (senderType === 'garage' ? senderId : null)

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

    // Prevent sending messages when the related request is in appointment status
    try {
      const requestScan = new RequestsScanCommand({
        TableName: 'Requests',
        FilterExpression: 'id = :requestId',
        ExpressionAttributeValues: {
          ':requestId': requestId
        }
      })

      const requestResult = await dynamoDB.send(requestScan)
      const requestItem = requestResult.Items && requestResult.Items[0]

      if (requestItem && requestItem.status === ServiceRequestStatus.APPOINTMENT) {
        return NextResponse.json(
          { error: 'Η συνομιλία είναι μόνο για ανάγνωση επειδή έχει προγραμματιστεί ραντεβού για αυτό το αίτημα.' },
          { status: 403 }
        )
      }
    } catch (statusError) {
      console.error('Error checking request status before creating chat message:', statusError)
      // In case of error checking status, fall back to allowing the message
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
      ...(effectiveGarageId && { garageId: effectiveGarageId })
    }

    const putCommand = new PutCommand({
      TableName: 'ChatMessages',
      Item: messageData
    })

    await dynamoDB.send(putCommand)

    logEvent({
      eventName: EventName.ChatMessageSent,
      actorType: senderType === 'garage' ? 'garage' : 'client',
      actorId: senderId,
      ...(senderType === 'client' ? { clientId: senderId } : {}),
      ...(effectiveGarageId ? { garageId: effectiveGarageId } : {}),
      requestId,
      source: 'api/chat/[requestId]/messages',
      metadata: { messageId, senderName, length: messageData.message.length }
    })

    // NOTE: email-on-new-chat is intentionally deferred. Without
    // online-presence detection it would spam users for every keystroke.
    // Add it once we have a debounced/offline detector.

            // Publish message to AppSync Events for real-time updates
            if (effectiveGarageId) {
              const channelName = `request-${requestId}-garage-${effectiveGarageId}`
              try {
                // Publish the message to AppSync Events
                await appSyncService.publishEvent(channelName, messageData)
                console.log(`[API] Message published to AppSync Events channel: ${channelName}`)
              } catch (error) {
                console.error('[API] Error publishing to AppSync Events:', error)
                // Don't fail the request if AppSync publishing fails
              }
            }

    return NextResponse.json({
      success: true,
      message: messageData
    })

  } catch (error) {
    console.error('Error creating chat message:', error)
    return NextResponse.json(
      { 
        error: 'Error creating chat message',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const POST = withMetrics(_POST)
