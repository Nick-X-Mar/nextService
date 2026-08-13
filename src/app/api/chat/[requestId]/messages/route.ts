import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import appSyncService from '@/lib/appsync-service'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { requireAuth } from '@/utils/requireAuth'
import { decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { randomUUID } from 'crypto'

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
    const requestedGarageId = searchParams.get('garageId')

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

    // Every garage's conversation on a request lives under the same requestId,
    // so the garage thread is separated by filter alone. That makes the filter
    // a security boundary, not a convenience: a garage must never be able to
    // choose someone else's thread, nor opt out of filtering and read them all.
    let garageId = requestedGarageId
    if (auth.userType === 'garage') {
      if (requestedGarageId && requestedGarageId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      garageId = auth.userId
    }

    // Query messages by requestId via the RequestMessagesIndex GSI.
    // FilterExpression still narrows to a specific garage thread when requested
    // — Filter is applied AFTER the index read, so it stays cheap.
    const expressionValues: Record<string, unknown> = { ':requestId': requestId }
    let filterExpression: string | undefined

    if (garageId) {
      filterExpression = '(senderId = :garageId OR (senderType = :clientType AND (garageId = :garageId OR attribute_not_exists(garageId))))'
      expressionValues[':garageId'] = garageId
      expressionValues[':clientType'] = 'client'
    }

    // Newest page first (ScanIndexForward: false), so opening a conversation
    // costs one small read regardless of how long the thread is. The client
    // reverses each page for display and walks `nextCursor` backwards through
    // history when the user asks for older messages.
    //
    // This read used to be unbounded: once a thread passed DynamoDB's 1MB page
    // limit it returned a partial history with no indication anything was
    // missing.
    const limit = parseLimit(searchParams.get('limit'), 50)
    const result = await dynamoDB.send(new QueryCommand({
      TableName: 'ChatMessages',
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :requestId',
      ExpressionAttributeValues: expressionValues,
      ...(filterExpression ? { FilterExpression: filterExpression } : {}),
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: decodeCursor(searchParams.get('cursor')),
    }))

    // Back to chronological order for rendering.
    const messages = [...(result.Items || [])].reverse()

    return NextResponse.json({
      success: true,
      messages,
      nextCursor: encodeCursor(result.LastEvaluatedKey),
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

    // The thread a message lands in — and the realtime channel it is published
    // to — is decided by garageId. Taking it from the body unchecked would let
    // one garage write into a competitor's conversation and have it appear live
    // in the client's chat with that competitor. A garage always writes to its
    // own thread; only a client (who owns the request) may address a garage.
    if (senderType === 'garage' && garageId && garageId !== auth.userId) {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }
    const effectiveGarageId = senderType === 'garage' ? senderId : (garageId || null)

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

    // Prevent sending messages when the related request is in appointment status.
    // We already loaded the request above, so just check its status.
    if (requestResult.Item.status === ServiceRequestStatus.APPOINTMENT) {
      return NextResponse.json(
        { error: 'Η συνομιλία είναι μόνο για ανάγνωση επειδή έχει προγραμματιστεί ραντεβού για αυτό το αίτημα.' },
        { status: 403 }
      )
    }

    // Generate unique message ID
    const messageId = `msg-${randomUUID()}`

    // Get sender name based on type
    let senderName = 'Unknown'
    if (senderType === 'garage') {
      const garageResult = await dynamoDB.send(new GetCommand({
        TableName: 'Garages',
        Key: { id: senderId }
      }))
      if (garageResult.Item) {
        senderName = garageResult.Item.companyName
      }
    } else {
      const clientResult = await dynamoDB.send(new GetCommand({
        TableName: 'Clients',
        Key: { id: senderId }
      }))
      if (clientResult.Item) {
        const client = clientResult.Item
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
