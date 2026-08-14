import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'

/**
 * Marks a standing notification as dealt with.
 *
 * Every alert needs a way to go away, or the banner becomes wallpaper and the
 * user learns to ignore it — which is worse than not having it. Each kind is
 * cleared by a timestamp written where the alert is computed from:
 *
 *   offers   → ServiceRequests.clientOffersSeenAt  (client opened the offers)
 *   accepted → Offers.garageSeenAcceptedAt         (garage opened the won offer)
 *
 * Messages clear through chat/[requestId]/mark-read instead, because read state
 * there is per counterparty rather than per row.
 */
async function _POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { kind, id } = await request.json()
    if (!kind || !id) {
      return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (kind === 'offers') {
      if (auth.userType !== 'client') {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const req = await dynamoDB.send(new GetCommand({
        TableName: 'ServiceRequests',
        Key: { id },
        ProjectionExpression: 'id, clientId',
      }))
      if (req.Item?.clientId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      await dynamoDB.send(new UpdateCommand({
        TableName: 'ServiceRequests',
        Key: { id },
        UpdateExpression: 'SET clientOffersSeenAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
    } else if (kind === 'accepted') {
      if (auth.userType !== 'garage') {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const offer = await dynamoDB.send(new GetCommand({
        TableName: 'Offers',
        Key: { id },
        ProjectionExpression: 'id, garageId',
      }))
      if (offer.Item?.garageId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      await dynamoDB.send(new UpdateCommand({
        TableName: 'Offers',
        Key: { id },
        UpdateExpression: 'SET garageSeenAcceptedAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
    } else {
      return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
    }

    if (auth.userType === 'client' || auth.userType === 'garage') {
      invalidateUnread(auth.userType, auth.userId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking notification seen:', error)
    return NextResponse.json({ error: 'Error marking notification seen' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
