import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    if (auth.userType !== 'client' && auth.userType !== 'garage') {
      return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
    }

    const { requestId } = await params
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
    }

    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId }
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Read state belongs to the thread, not to the account. It used to be a
    // single `lastReadByClient` field on the Garages row, which meant any one
    // client opening a chat cleared that garage's unread badge for every other
    // client. A request has exactly one client, so (requestId, garageId)
    // identifies the thread — store it on the request as a garageId -> ISO map.
    //
    // Both sides use the same shape, in separate maps:
    //   clientReadAt[garageId] — how far this request's client has read that garage
    //   garageReadAt[garageId] — how far that garage has read this request's client
    let field: 'clientReadAt' | 'garageReadAt'
    let key: string

    if (auth.userType === 'client') {
      if (requestResult.Item.clientId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const { garageId } = await request.json()
      if (!garageId) {
        return NextResponse.json({ error: 'Garage ID is required' }, { status: 400 })
      }
      field = 'clientReadAt'
      key = garageId
    } else {
      // A garage marks only its own side read, so the key comes from the token
      // rather than the body — a garage must not be able to clear another's.
      field = 'garageReadAt'
      key = auth.userId
    }

    // Two updates so concurrent marks on different garages can't clobber each
    // other: create the map if absent, then set only this thread's key.
    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: `SET ${field} = if_not_exists(${field}, :empty)`,
      ExpressionAttributeValues: { ':empty': {} }
    }))

    await dynamoDB.send(new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: `SET ${field}.#key = :timestamp`,
      ExpressionAttributeNames: { '#key': key },
      ExpressionAttributeValues: { ':timestamp': new Date().toISOString() }
    }))

    // Drop the cached summary so the nav badge reflects the read immediately
    // instead of lingering for the rest of the TTL.
    invalidateUnread(auth.userType, auth.userId)

    return NextResponse.json({
      success: true,
      message: 'Messages marked as read'
    })

  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json(
      {
        error: 'Error marking messages as read',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
