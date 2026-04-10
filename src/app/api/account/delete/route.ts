import { NextRequest, NextResponse } from 'next/server'
import {
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { verifyPassword } from '@/utils/passwordService'
import { deleteFileFromS3, extractS3KeyFromUrl } from '@/utils/s3Service'
import { requireAuth } from '@/utils/requireAuth'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'

interface DeleteSummary {
  vehicles: number
  serviceRequests: number
  chatMessages: number
  offers: number
  s3Photos: number
  eventLogs: number
  emailLogs: number
}

/**
 * POST /api/account/delete
 *
 * Body: { userId, userType: 'client' | 'garage', password }
 *
 * Verifies the password (defense in depth — even if an attacker knows the
 * userId, they can't delete the account without the password) and then
 * cascades a hard delete across every table that references the user,
 * plus all associated S3 photos.
 *
 * This is the GDPR "right to erasure" implementation.
 */
export async function POST(request: NextRequest) {
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
        { error: 'Πρέπει να επιβεβαιώσεις τον κωδικό σου για τη διαγραφή' },
        { status: 400 }
      )
    }

    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    // Look up the user and verify password
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
      return NextResponse.json(
        { error: 'Ο λογαριασμός δεν έχει κωδικό. Επικοινώνησε με την υποστήριξη.' },
        { status: 400 }
      )
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      return NextResponse.json({ error: 'Λάθος κωδικός' }, { status: 401 })
    }

    const summary: DeleteSummary = {
      vehicles: 0,
      serviceRequests: 0,
      chatMessages: 0,
      offers: 0,
      s3Photos: 0,
      eventLogs: 0,
      emailLogs: 0
    }

    if (userType === 'client') {
      await deleteClientCascade(userId, summary)
    } else {
      await deleteGarageCascade(userId, summary)
    }

    // Finally delete the user record itself
    await dynamoDB.send(
      new DeleteCommand({ TableName: tableName, Key: { id: userId } })
    )

    return NextResponse.json({
      success: true,
      message: 'Ο λογαριασμός σου διαγράφηκε επιτυχώς',
      summary
    })
  } catch (err) {
    console.error('[account/delete] error:', err)
    return NextResponse.json(
      { error: 'Σφάλμα κατά τη διαγραφή του λογαριασμού' },
      { status: 500 }
    )
  }
}

async function deleteClientCascade(clientId: string, summary: DeleteSummary): Promise<void> {
  // 1. Find all service requests by this client (need them for offer + chat cleanup + S3)
  const reqsRes = await dynamoDB.send(
    new ScanCommand({
      TableName: 'ServiceRequests',
      FilterExpression: 'clientId = :c',
      ExpressionAttributeValues: { ':c': clientId }
    })
  )
  const requests = reqsRes.Items || []
  const requestIds = requests.map((r) => r.id as string)

  // 2. Delete S3 photos referenced by requests
  for (const req of requests) {
    const photos = (req.photos as Array<{ s3Key?: string; s3Url?: string }>) || []
    for (const photo of photos) {
      const key = photo.s3Key || (photo.s3Url ? extractS3KeyFromUrl(photo.s3Url) : null)
      if (key) {
        try {
          await deleteFileFromS3(key)
          summary.s3Photos++
        } catch (e) {
          console.error('[account/delete] failed to delete S3 photo:', key, e)
        }
      }
    }
  }

  // 3. Delete chat messages for these requests
  for (const requestId of requestIds) {
    const chatRes = await dynamoDB.send(
      new ScanCommand({
        TableName: 'ChatMessages',
        FilterExpression: 'requestId = :r',
        ExpressionAttributeValues: { ':r': requestId }
      })
    )
    for (const msg of chatRes.Items || []) {
      await dynamoDB.send(
        new DeleteCommand({ TableName: 'ChatMessages', Key: { id: msg.id } })
      )
      summary.chatMessages++
    }
  }

  // 4. Delete offers attached to these requests
  for (const requestId of requestIds) {
    const offerRes = await dynamoDB.send(
      new ScanCommand({
        TableName: 'Offers',
        FilterExpression: 'serviceRequestId = :r',
        ExpressionAttributeValues: { ':r': requestId }
      })
    )
    for (const offer of offerRes.Items || []) {
      await dynamoDB.send(
        new DeleteCommand({ TableName: 'Offers', Key: { id: offer.id } })
      )
      summary.offers++
    }
  }

  // 5. Delete the service requests themselves
  for (const requestId of requestIds) {
    await dynamoDB.send(
      new DeleteCommand({ TableName: 'ServiceRequests', Key: { id: requestId } })
    )
    summary.serviceRequests++
  }

  // 6. Delete the client's vehicles
  const vehiclesRes = await dynamoDB.send(
    new ScanCommand({
      TableName: 'Vehicles',
      FilterExpression: 'clientId = :c',
      ExpressionAttributeValues: { ':c': clientId }
    })
  )
  for (const vehicle of vehiclesRes.Items || []) {
    await dynamoDB.send(
      new DeleteCommand({ TableName: 'Vehicles', Key: { id: vehicle.id } })
    )
    summary.vehicles++
  }

  // 7. Wipe analytics: EventLogs + EmailLogs that mention this client
  await wipeLogsByAttribute('clientId', clientId, summary)
}

async function deleteGarageCascade(garageId: string, summary: DeleteSummary): Promise<void> {
  // 1. Delete all offers from this garage
  const offerRes = await dynamoDB.send(
    new ScanCommand({
      TableName: 'Offers',
      FilterExpression: 'garageId = :g',
      ExpressionAttributeValues: { ':g': garageId }
    })
  )
  for (const offer of offerRes.Items || []) {
    await dynamoDB.send(
      new DeleteCommand({ TableName: 'Offers', Key: { id: offer.id } })
    )
    summary.offers++
  }

  // 2. Delete chat messages where the garage is sender
  const chatRes = await dynamoDB.send(
    new ScanCommand({
      TableName: 'ChatMessages',
      FilterExpression:
        '(senderType = :g AND senderId = :id) OR garageId = :id',
      ExpressionAttributeValues: { ':g': 'garage', ':id': garageId }
    })
  )
  for (const msg of chatRes.Items || []) {
    await dynamoDB.send(
      new DeleteCommand({ TableName: 'ChatMessages', Key: { id: msg.id } })
    )
    summary.chatMessages++
  }

  // 3. Wipe analytics: EventLogs + EmailLogs
  await wipeLogsByAttribute('garageId', garageId, summary)
}

async function wipeLogsByAttribute(
  attrName: 'clientId' | 'garageId',
  value: string,
  summary: DeleteSummary
): Promise<void> {
  // EventLogs
  const eventRes = await dynamoDB.send(
    new ScanCommand({
      TableName: EVENT_LOGS_TABLE,
      FilterExpression: `${attrName} = :v`,
      ExpressionAttributeValues: { ':v': value }
    })
  )
  await batchDelete(EVENT_LOGS_TABLE, 'eventId', (eventRes.Items || []).map((i) => i.eventId as string))
  summary.eventLogs += (eventRes.Items || []).length

  // EmailLogs
  const emailRes = await dynamoDB.send(
    new ScanCommand({
      TableName: EMAIL_LOGS_TABLE,
      FilterExpression: `${attrName} = :v`,
      ExpressionAttributeValues: { ':v': value }
    })
  )
  await batchDelete(EMAIL_LOGS_TABLE, 'emailId', (emailRes.Items || []).map((i) => i.emailId as string))
  summary.emailLogs += (emailRes.Items || []).length
}

async function batchDelete(
  table: string,
  pkName: string,
  ids: string[]
): Promise<void> {
  // BatchWriteCommand max 25 items at a time
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25)
    if (chunk.length === 0) continue
    await dynamoDB.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: chunk.map((id) => ({ DeleteRequest: { Key: { [pkName]: id } } }))
        }
      })
    )
  }
}
