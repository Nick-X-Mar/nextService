import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'
import { decodeCursor, encodeCursor, parseLimit } from '@/utils/pagination'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { createChatMessage, resolveThread, isChatPermissionError } from '@/utils/chatService'
import { presignChatAttachments } from '@/utils/chatAttachments'

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
    // It is also what scopes a photo sent in chat to a single garage.
    let garageId = requestedGarageId
    if (auth.userType === 'garage') {
      if (requestedGarageId && requestedGarageId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      garageId = auth.userId
    }

    // Query messages by requestId via the RequestMessagesIndex GSI.
    // FilterExpression still narrows to a specific garage thread when requested.
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

    // `Limit` bounds the rows DynamoDB READS from the index, not the rows that
    // survive `FilterExpression`. Every garage competing on a request shares
    // one `requestId` partition, so on a busy request a single 50-row page
    // could come back with a handful of messages — or none — while still
    // reporting more to come. That is what "the chat won't load" looked like.
    //
    // So: read wider pages when filtering, and keep reading until we actually
    // have a full page of this thread's messages. MAX_INDEX_PAGES caps the
    // worst case so a pathological thread can't turn one request into an
    // unbounded scan.
    const MAX_INDEX_PAGES = 5
    const pageSize = filterExpression ? Math.min(limit * 4, 200) : limit

    type ChatRow = Record<string, unknown> & { id?: string; timestamp?: string }
    const collected: ChatRow[] = []
    let startKey = decodeCursor(searchParams.get('cursor'))
    let lastEvaluatedKey: Record<string, unknown> | undefined
    let pages = 0

    do {
      const page = await dynamoDB.send(new QueryCommand({
        TableName: 'ChatMessages',
        IndexName: 'RequestMessagesIndex',
        KeyConditionExpression: 'requestId = :requestId',
        ExpressionAttributeValues: expressionValues,
        ...(filterExpression ? { FilterExpression: filterExpression } : {}),
        ScanIndexForward: false,
        Limit: pageSize,
        ExclusiveStartKey: startKey,
      }))
      collected.push(...((page.Items || []) as ChatRow[]))
      lastEvaluatedKey = page.LastEvaluatedKey
      startKey = lastEvaluatedKey
      pages++
    } while (lastEvaluatedKey && collected.length < limit && pages < MAX_INDEX_PAGES)

    // Trim to the page the caller asked for. When we overshot, the resume
    // point is the last row we are actually returning — `LastEvaluatedKey`
    // points past it and would skip everything in between. The index is
    // (requestId, timestamp) over a table keyed by `id`, so those three
    // attributes are the whole key.
    const overshot = collected.length > limit
    const kept = overshot ? collected.slice(0, limit) : collected
    const boundary = kept[kept.length - 1]
    const nextCursorKey = overshot && boundary
      ? { requestId, timestamp: boundary.timestamp, id: boundary.id }
      : lastEvaluatedKey

    // Back to chronological order for rendering.
    const ordered = [...kept].reverse()
    // Attachments are stored as S3 keys against a private bucket; the viewer
    // gets a short-lived signed URL minted here.
    const messages = await presignChatAttachments(ordered)

    // How far this viewer has read the thread, so callers can mark messages
    // unread without a second round trip. ChatMessages rows carry a `read`
    // flag that nothing ever sets — the read state lives on the request as a
    // per-thread timestamp map instead. See mark-read.
    const readMap = (auth.userType === 'garage'
      ? requestResult.Item.garageReadAt
      : requestResult.Item.clientReadAt) as Record<string, string> | undefined
    const readKey = auth.userType === 'garage' ? auth.userId : garageId
    const lastReadAt = readKey ? readMap?.[readKey] ?? null : null

    return NextResponse.json({
      success: true,
      messages,
      lastReadAt,
      nextCursor: encodeCursor(nextCursorKey),
    }, {
      // Private, and never reusable. Safari is markedly more willing than
      // Chrome to serve a directive-less fetch() GET from its disk cache, and
      // a cached message list is indistinguishable from "my message didn't
      // send". The presigned attachment URLs in the body expire, too.
      headers: { 'Cache-Control': 'no-store, private' },
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

    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const { message, garageId } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Ownership, thread selection and the post-appointment read-only rule all
    // live in one place, shared with the attachments route.
    const thread = resolveThread(auth, requestResult.Item, garageId)
    if (isChatPermissionError(thread)) {
      return NextResponse.json({ error: thread.error }, { status: thread.status })
    }

    const messageData = await createChatMessage({
      requestId,
      request: requestResult.Item,
      auth,
      message,
      garageId: thread.garageId,
    })

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
