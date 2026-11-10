import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { requireAuth, requireActiveGarage } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { invalidateUnread } from '@/utils/unreadCache'
import { TABLES } from '@/lib/tables'
import { collectAll } from '@/utils/pagination'
import { OfferStatus } from '@/types/statuses'

/**
 * Marks a standing notification as dealt with.
 *
 * Every alert needs a way to go away, or the banner becomes wallpaper and the
 * user learns to ignore it — which is worse than not having it. Each kind is
 * cleared by a timestamp written where the alert is computed from:
 *
 *   offers   → ServiceRequests.clientOffersSeenAt  (client opened the offers)
 *   accepted → Offers.garageSeenAcceptedAt         (garage opened the won offer)
 *   dates    → Offers.garageSeenDatesAt            (garage saw the client's proposed dates)
 *   lost     → Offers.garageSeenLostAt             (garage saw that the client chose another offer)
 *
 * Opening the offers also stamps `Offers.clientViewedAt` on each live offer, so
 * the garage can see that the client has looked at its price.
 *
 * Messages clear through chat/[requestId]/mark-read instead, because read state
 * there is per counterparty rather than per row.
 */
async function _POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // An empty or malformed body is the caller's mistake, not a server error:
    // `request.json()` throws on it, which used to surface as a 500 and a
    // SyntaxError in the logs.
    const body: unknown = await request.json().catch(() => null)
    const { kind, id } = (body && typeof body === 'object' ? body : {}) as { kind?: unknown; id?: unknown }
    if (typeof kind !== 'string' || !kind || typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (kind === 'offers') {
      if (auth.userType !== 'client') {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const req = await dynamoDB.send(new GetCommand({
        TableName: TABLES.ServiceRequests,
        Key: { id },
        ProjectionExpression: 'id, clientId',
      }))
      if (req.Item?.clientId !== auth.userId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.ServiceRequests,
        Key: { id },
        UpdateExpression: 'SET clientOffersSeenAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
      await markOffersViewed(id, now)
    } else if (kind === 'accepted' || kind === 'dates') {
      if (auth.userType !== 'garage') {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const garageId = await requireActiveGarage(request)
      if (garageId instanceof NextResponse) return garageId
      const offer = await dynamoDB.send(new GetCommand({
        TableName: TABLES.Offers,
        Key: { id },
        ProjectionExpression: 'id, garageId',
      }))
      if (offer.Item?.garageId !== garageId) {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Offers,
        Key: { id },
        UpdateExpression:
          kind === 'accepted' ? 'SET garageSeenAcceptedAt = :now' : 'SET garageSeenDatesAt = :now',
        ExpressionAttributeValues: { ':now': now },
      }))
    } else if (kind === 'lost') {
      // `id` is the request: the garage arrives from a link to a job it can no
      // longer open, and only the request id is in that link.
      if (auth.userType !== 'garage') {
        return NextResponse.json({ error: 'Δεν έχετε πρόσβαση' }, { status: 403 })
      }
      const offers = await offersOn(id)
      await Promise.all(
        offers
          .filter((offer) => offer.garageId === auth.userId)
          .map((offer) => dynamoDB.send(new UpdateCommand({
            TableName: TABLES.Offers,
            Key: { id: offer.id },
            UpdateExpression: 'SET garageSeenLostAt = :now',
            ExpressionAttributeValues: { ':now': now },
          })))
      )
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

function offersOn(requestId: string) {
  return collectAll<Record<string, unknown>>(
    (startKey) => dynamoDB.send(new QueryCommand({
      TableName: TABLES.Offers,
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :requestId',
      ExpressionAttributeValues: { ':requestId': requestId },
      ExclusiveStartKey: startKey,
    })),
    `offers on ${requestId}`
  )
}

/**
 * The client has the offers in front of them: each still-live offer records
 * when it was last looked at. An offer that has meanwhile been accepted or
 * closed keeps what it had.
 */
async function markOffersViewed(requestId: string, now: string): Promise<void> {
  const offers = await offersOn(requestId)
  await Promise.all(
    offers
      .filter((offer) => offer.status === OfferStatus.PENDING)
      .map(async (offer) => {
        try {
          await dynamoDB.send(new UpdateCommand({
            TableName: TABLES.Offers,
            Key: { id: offer.id },
            UpdateExpression: 'SET clientViewedAt = :now',
            ConditionExpression: '#status = :pending',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':now': now, ':pending': OfferStatus.PENDING },
          }))
        } catch (err) {
          if (!(err instanceof ConditionalCheckFailedException)) throw err
        }
      })
  )
}

export const POST = withMetrics(_POST)
