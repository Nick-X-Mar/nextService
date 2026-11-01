import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { requireActiveGarage } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { logEvent } from '@/utils/eventLogger'
import { invalidateUnread } from '@/utils/unreadCache'
import { ensureRequestDeclinesTable } from '@/utils/ensureLedgerTables'
import { declineIdFor } from '@/utils/requestDeclines'
import { offerIdFor } from '@/app/api/offers/offerWrites'
import { EventName } from '@/types/events'
import { ServiceRequestStatus } from '@/types/statuses'
import { isDeclineReason } from '@/types/declines'
import { TABLES } from '@/lib/tables'

const checkRate = createRateLimiter('request-decline', 60, 3600000)

/**
 * A garage says it cannot take a request. The request leaves its feed and its
 * badge and is listed under Προσφορές → Απορριφθείσες with the reason. Nothing
 * reaches the client, who simply gets one offer fewer.
 *
 * Only on a pending request the garage has not quoted: a garage that has
 * already sent an offer and changed its mind does not get to vanish from the
 * client's list this way.
 */
async function _POST(request: NextRequest) {
  try {
    const garageId = await requireActiveGarage(request)
    if (garageId instanceof NextResponse) return garageId

    if (!checkRate(garageId)) {
      return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις. Δοκιμάστε αργότερα.' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) ?? {}
    const requestId = typeof body.requestId === 'string' ? body.requestId : ''
    if (!requestId) {
      return NextResponse.json({ error: 'Λείπει το αίτημα.' }, { status: 400 })
    }
    if (!isDeclineReason(body.reason)) {
      return NextResponse.json({ error: 'Διάλεξε τον λόγο.' }, { status: 400 })
    }
    const reasonText = typeof body.reasonText === 'string' ? body.reasonText.trim().slice(0, 500) : ''
    if (body.reason === 'other' && !reasonText) {
      return NextResponse.json({ error: 'Γράψε τον λόγο.' }, { status: 400 })
    }

    const [serviceRequest, offer] = await Promise.all([
      dynamoDB.send(new GetCommand({
        TableName: TABLES.ServiceRequests,
        Key: { id: requestId },
        ProjectionExpression: 'id, #status',
        ExpressionAttributeNames: { '#status': 'status' },
      })),
      dynamoDB.send(new GetCommand({
        TableName: TABLES.Offers,
        Key: { id: offerIdFor(requestId, garageId) },
        ProjectionExpression: 'id',
      })),
    ])
    if (!serviceRequest.Item) {
      return NextResponse.json({ error: 'Το αίτημα δεν βρέθηκε' }, { status: 404 })
    }
    if (serviceRequest.Item.status !== ServiceRequestStatus.PENDING) {
      return NextResponse.json({ error: 'Το αίτημα δεν είναι πλέον ανοιχτό.' }, { status: 409 })
    }
    if (offer.Item) {
      return NextResponse.json({ error: 'Έχεις ήδη στείλει προσφορά σε αυτό το αίτημα.' }, { status: 409 })
    }

    await ensureRequestDeclinesTable()
    const createdAt = new Date().toISOString()
    try {
      await dynamoDB.send(new PutCommand({
        TableName: TABLES.RequestDeclines,
        Item: {
          declineId: declineIdFor(requestId, garageId),
          requestId,
          garageId,
          reason: body.reason,
          ...(reasonText ? { reasonText } : {}),
          createdAt,
        },
        ConditionExpression: 'attribute_not_exists(declineId)',
      }))
    } catch (err) {
      // Already declined (a double tap, a second tab): the outcome is the same.
      if (!(err instanceof ConditionalCheckFailedException)) throw err
      return NextResponse.json({ success: true })
    }

    await logEvent({
      eventName: EventName.GarageDeclinedRequest,
      actorType: 'garage',
      actorId: garageId,
      garageId,
      requestId,
      metadata: { reason: body.reason },
    })
    // The Αιτήματα badge counts this request until the summary is recomputed.
    invalidateUnread('garage', garageId)

    return NextResponse.json({ success: true, createdAt })
  } catch (error) {
    console.error('Error declining request:', error)
    return NextResponse.json({ error: 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
