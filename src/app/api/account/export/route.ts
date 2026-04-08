import { NextRequest, NextResponse } from 'next/server'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { verifyPassword } from '@/utils/passwordService'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'

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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, userType, password } = body || {}

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
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': userId }
      })
    )
    const user = lookup.Items?.[0]
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
          new ScanCommand({
            TableName: 'Vehicles',
            FilterExpression: 'clientId = :c',
            ExpressionAttributeValues: { ':c': userId }
          })
        ),
        dynamoDB.send(
          new ScanCommand({
            TableName: 'ServiceRequests',
            FilterExpression: 'clientId = :c',
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
            new ScanCommand({
              TableName: 'Offers',
              FilterExpression: 'serviceRequestId = :r',
              ExpressionAttributeValues: { ':r': requestId }
            })
          ),
          dynamoDB.send(
            new ScanCommand({
              TableName: 'ChatMessages',
              FilterExpression: 'requestId = :r',
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
      // Garage export
      const [offRes, chatRes] = await Promise.all([
        dynamoDB.send(
          new ScanCommand({
            TableName: 'Offers',
            FilterExpression: 'garageId = :g',
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

    // Include the user's audit trail from EventLogs (truncated to last 500
    // entries to keep the export reasonable in size)
    const eventAttr = userType === 'garage' ? 'garageId' : 'clientId'
    const eventsRes = await dynamoDB.send(
      new ScanCommand({
        TableName: EVENT_LOGS_TABLE,
        FilterExpression: `${eventAttr} = :id`,
        ExpressionAttributeValues: { ':id': userId },
        Limit: 500
      })
    )
    exportData.activityLog = eventsRes.Items || []

    // Include emails sent to/about this user
    const emailsRes = await dynamoDB.send(
      new ScanCommand({
        TableName: EMAIL_LOGS_TABLE,
        FilterExpression: `${eventAttr} = :id`,
        ExpressionAttributeValues: { ':id': userId },
        Limit: 500
      })
    )
    exportData.emailsReceived = emailsRes.Items || []

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
