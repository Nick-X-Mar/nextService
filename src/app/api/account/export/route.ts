import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { verifyPassword } from '@/utils/passwordService'
import { requireAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'

/**
 * Collects every log row belonging to one user, following DynamoDB's pagination.
 *
 * This used to be a single scan with `Limit: 500`. In DynamoDB `Limit` caps the
 * items *examined*, not the items returned after `FilterExpression` — so on a
 * table holding every user's events, that call examined 500 arbitrary rows and
 * returned only those few that happened to belong to this user. A person
 * exercising their GDPR right of access could receive almost none of their
 * data, with no indication anything was missing.
 *
 * MAX_PAGES is a safety stop so a very large table can't hang the request; if
 * it is ever reached that is logged rather than silently truncating.
 */
const MAX_PAGES = 50

async function scanAllForUser(
  tableName: string,
  attrName: string,
  userId: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = []
  let startKey: Record<string, unknown> | undefined
  let pages = 0

  do {
    const res = await dynamoDB.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: `${attrName} = :id`,
        ExpressionAttributeValues: { ':id': userId },
        ExclusiveStartKey: startKey,
      })
    )
    items.push(...((res.Items || []) as Record<string, unknown>[]))
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined
    pages++
  } while (startKey && pages < MAX_PAGES)

  if (startKey) {
    console.warn(
      `[account/export] ${tableName}: stopped after ${MAX_PAGES} pages for ${userId} — export may be incomplete`
    )
  }

  return items
}

/**
 * POST /api/account/export
 *
 * Body: { userId, userType: 'client' | 'garage', password }
 *
 * Returns a JSON dump of every piece of data we hold on the user. This is
 * the GDPR "right to data portability" implementation. Password is required
 * so a leaked userId can't be used to dump someone else's data.
 *
 * Sensitive fields like passwordHash are stripped from the output.
 */
async function _POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { password } = body || {}
    // Use authenticated identity instead of body values
    const userId = auth.userId
    const userType = auth.userType

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }
    if (!['client', 'garage'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 })
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Πρέπει να επιβεβαιώσεις τον κωδικό σου' },
        { status: 400 }
      )
    }

    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    const lookup = await dynamoDB.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: userId }
      })
    )
    const user = lookup.Item
    if (!user) {
      return NextResponse.json({ error: 'Ο λογαριασμός δεν βρέθηκε' }, { status: 404 })
    }
    if (!user.passwordHash) {
      return NextResponse.json({ error: 'Λάθος κωδικός' }, { status: 401 })
    }
    const ok = await verifyPassword(password, user.passwordHash as string)
    if (!ok) {
      return NextResponse.json({ error: 'Λάθος κωδικός' }, { status: 401 })
    }

    // Strip sensitive fields from the profile dump
    const profile = { ...user }
    delete profile.passwordHash
    delete profile.passwordResetTokenHash
    delete profile.passwordResetExpiresAt

    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      userType,
      profile
    }

    if (userType === 'client') {
      const [vehiclesRes, requestsRes] = await Promise.all([
        dynamoDB.send(
          new QueryCommand({
            TableName: 'Vehicles',
            IndexName: 'ClientVehiclesIndex',
            KeyConditionExpression: 'clientId = :c',
            ExpressionAttributeValues: { ':c': userId }
          })
        ),
        dynamoDB.send(
          new QueryCommand({
            TableName: 'ServiceRequests',
            IndexName: 'ClientRequestsIndex',
            KeyConditionExpression: 'clientId = :c',
            ExpressionAttributeValues: { ':c': userId }
          })
        )
      ])

      const requests = requestsRes.Items || []
      const requestIds = requests.map((r) => r.id as string)

      const offers: Record<string, unknown>[] = []
      const chats: Record<string, unknown>[] = []
      for (const requestId of requestIds) {
        const [offRes, chatRes] = await Promise.all([
          dynamoDB.send(
            new QueryCommand({
              TableName: 'Offers',
              IndexName: 'ServiceRequestOffersIndex',
              KeyConditionExpression: 'serviceRequestId = :r',
              ExpressionAttributeValues: { ':r': requestId }
            })
          ),
          dynamoDB.send(
            new QueryCommand({
              TableName: 'ChatMessages',
              IndexName: 'RequestMessagesIndex',
              KeyConditionExpression: 'requestId = :r',
              ExpressionAttributeValues: { ':r': requestId }
            })
          )
        ])
        offers.push(...(offRes.Items || []))
        chats.push(...(chatRes.Items || []))
      }

      exportData.vehicles = vehiclesRes.Items || []
      exportData.serviceRequests = requests
      exportData.offersReceived = offers
      exportData.chatMessages = chats
    } else {
      // Garage export. Chat scan stays as Scan because the compound predicate
      // (senderType+senderId OR garageId) doesn't fit a single GSI; this is an
      // admin-only data export, not on the hot path.
      const [offRes, chatRes] = await Promise.all([
        dynamoDB.send(
          new QueryCommand({
            TableName: 'Offers',
            IndexName: 'GarageOffersIndex',
            KeyConditionExpression: 'garageId = :g',
            ExpressionAttributeValues: { ':g': userId }
          })
        ),
        dynamoDB.send(
          new ScanCommand({
            TableName: 'ChatMessages',
            FilterExpression:
              '(senderType = :g AND senderId = :id) OR garageId = :id',
            ExpressionAttributeValues: { ':g': 'garage', ':id': userId }
          })
        )
      ])
      exportData.offersSent = offRes.Items || []
      exportData.chatMessages = chatRes.Items || []
    }

    const eventAttr = userType === 'garage' ? 'garageId' : 'clientId'
    exportData.activityLog = await scanAllForUser(EVENT_LOGS_TABLE, eventAttr, userId)
    exportData.emailsReceived = await scanAllForUser(EMAIL_LOGS_TABLE, eventAttr, userId)

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="nextservice-data-${userId}-${Date.now()}.json"`
      }
    })
  } catch (err) {
    console.error('[account/export] error:', err)
    return NextResponse.json(
      { error: 'Σφάλμα κατά την εξαγωγή των δεδομένων' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
