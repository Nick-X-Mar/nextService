import { NextRequest, NextResponse } from 'next/server'
import {
  ScanCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
  type BatchWriteCommandInput,
  type BatchWriteCommandOutput,
  type QueryCommandInput,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { verifyPassword } from '@/utils/passwordService'
import { deleteFileFromS3, extractS3KeyFromUrl } from '@/utils/s3Service'
import { requireAuth } from '@/utils/requireAuth'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'

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
 * plus every S3 object they put there: request photos, the άδεια of their
 * cars, chat attachments.
 *
 * This is the GDPR "right to erasure" implementation.
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
        { error: 'Πρέπει να επιβεβαιώσεις τον κωδικό σου για τη διαγραφή' },
        { status: 400 }
      )
    }

    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    // Look up the user and verify password
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

    logEvent({
      eventName: EventName.AccountDeleted,
      actorType: userType === 'client' ? 'client' : 'garage',
      actorId: userId,
      ...(userType === 'client' ? { clientId: userId } : { garageId: userId }),
      metadata: { deletedRecords: summary },
    })

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

type Row = Record<string, unknown>

/**
 * Every page of a Query or Scan. A single call stops at 1 MB of data read, so
 * on the shared log tables — where one user's rows are a sliver of the whole —
 * a deletion used to leave most of them behind and still report success.
 */
async function queryAll(input: QueryCommandInput): Promise<Row[]> {
  const rows: Row[] = []
  let start: Record<string, unknown> | undefined
  do {
    const res = await dynamoDB.send(new QueryCommand({ ...input, ExclusiveStartKey: start }))
    rows.push(...((res.Items as Row[] | undefined) || []))
    start = res.LastEvaluatedKey
  } while (start)
  return rows
}

async function scanAll(input: ScanCommandInput): Promise<Row[]> {
  const rows: Row[] = []
  let start: Record<string, unknown> | undefined
  do {
    const res = await dynamoDB.send(new ScanCommand({ ...input, ExclusiveStartKey: start }))
    rows.push(...((res.Items as Row[] | undefined) || []))
    start = res.LastEvaluatedKey
  } while (start)
  return rows
}

/** A stored photo reference — a bare key, or a full URL on older rows — as its S3 key. */
function s3KeyOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return value.includes('amazonaws.com/') ? extractS3KeyFromUrl(value) : value
}

/**
 * Every S3 object a set of rows points at. Request photos live in `photoUrls`
 * (keys) — this used to read a `photos` field nothing writes, so not one photo
 * was ever deleted. Older rows may still carry `photos: [{ s3Key | s3Url }]`.
 */
function requestPhotoKeys(request: Row): string[] {
  const keys = ((request.photoUrls as unknown[] | undefined) || []).map(s3KeyOf)
  for (const photo of (request.photos as Array<{ s3Key?: string; s3Url?: string }> | undefined) || []) {
    keys.push(s3KeyOf(photo?.s3Key) ?? s3KeyOf(photo?.s3Url))
  }
  return keys.filter((k): k is string => !!k)
}

function attachmentKeys(message: Row): string[] {
  return ((message.attachments as Array<{ s3Key?: string }> | undefined) || [])
    .map((a) => s3KeyOf(a?.s3Key))
    .filter((k): k is string => !!k)
}

async function deleteS3Objects(keys: Iterable<string>, summary: DeleteSummary): Promise<void> {
  for (const key of new Set(keys)) {
    // deleteFileFromS3 reports failure in its result rather than throwing.
    const res = await deleteFileFromS3(key)
    if (res.success) summary.s3Photos++
    else console.error('[account/delete] failed to delete S3 object:', key, res.error)
  }
}

async function deleteClientCascade(clientId: string, summary: DeleteSummary): Promise<void> {
  const requests = await queryAll({
    TableName: 'ServiceRequests',
    IndexName: 'ClientRequestsIndex',
    KeyConditionExpression: 'clientId = :c',
    ExpressionAttributeValues: { ':c': clientId },
  })
  const vehicles = await queryAll({
    TableName: 'Vehicles',
    IndexName: 'ClientVehiclesIndex',
    KeyConditionExpression: 'clientId = :c',
    ExpressionAttributeValues: { ':c': clientId },
  })

  // The photos of every request, every chat attachment in their threads, and
  // the άδεια of every car — which carries the owner's name and address.
  const s3Keys: string[] = requests.flatMap(requestPhotoKeys)
  for (const vehicle of vehicles) {
    const key = s3KeyOf(vehicle.licensePhotoUrl)
    if (key) s3Keys.push(key)
  }

  for (const req of requests) {
    const requestId = req.id as string
    const messages = await queryAll({
      TableName: 'ChatMessages',
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :r',
      ExpressionAttributeValues: { ':r': requestId },
    })
    for (const msg of messages) {
      s3Keys.push(...attachmentKeys(msg))
      await dynamoDB.send(new DeleteCommand({ TableName: 'ChatMessages', Key: { id: msg.id } }))
      summary.chatMessages++
    }

    const offers = await queryAll({
      TableName: 'Offers',
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :r',
      ExpressionAttributeValues: { ':r': requestId },
      ProjectionExpression: 'id',
    })
    for (const offer of offers) {
      await dynamoDB.send(new DeleteCommand({ TableName: 'Offers', Key: { id: offer.id } }))
      summary.offers++
    }

    await dynamoDB.send(new DeleteCommand({ TableName: 'ServiceRequests', Key: { id: requestId } }))
    summary.serviceRequests++
  }

  for (const vehicle of vehicles) {
    await dynamoDB.send(new DeleteCommand({ TableName: 'Vehicles', Key: { id: vehicle.id } }))
    summary.vehicles++
  }

  await deleteS3Objects(s3Keys, summary)

  // Analytics: EventLogs + EmailLogs that mention this client
  await wipeLogsByAttribute('clientId', clientId, summary)
}

async function deleteGarageCascade(garageId: string, summary: DeleteSummary): Promise<void> {
  const offers = await queryAll({
    TableName: 'Offers',
    IndexName: 'GarageOffersIndex',
    KeyConditionExpression: 'garageId = :g',
    ExpressionAttributeValues: { ':g': garageId },
    ProjectionExpression: 'id',
  })
  for (const offer of offers) {
    await dynamoDB.send(new DeleteCommand({ TableName: 'Offers', Key: { id: offer.id } }))
    summary.offers++
  }

  // Every message in this garage's threads, from either side, with its photos.
  const messages = await scanAll({
    TableName: 'ChatMessages',
    FilterExpression: '(senderType = :g AND senderId = :id) OR garageId = :id',
    ExpressionAttributeValues: { ':g': 'garage', ':id': garageId },
  })
  const s3Keys: string[] = []
  for (const msg of messages) {
    s3Keys.push(...attachmentKeys(msg))
    await dynamoDB.send(new DeleteCommand({ TableName: 'ChatMessages', Key: { id: msg.id } }))
    summary.chatMessages++
  }
  await deleteS3Objects(s3Keys, summary)

  // Analytics: EventLogs + EmailLogs
  await wipeLogsByAttribute('garageId', garageId, summary)
}

async function wipeLogsByAttribute(
  attrName: 'clientId' | 'garageId',
  value: string,
  summary: DeleteSummary
): Promise<void> {
  const events = await scanAll({
    TableName: EVENT_LOGS_TABLE,
    FilterExpression: `${attrName} = :v`,
    ExpressionAttributeValues: { ':v': value },
    ProjectionExpression: 'eventId',
  })
  await batchDelete(EVENT_LOGS_TABLE, 'eventId', events.map((i) => i.eventId as string))
  summary.eventLogs += events.length

  const emails = await scanAll({
    TableName: EMAIL_LOGS_TABLE,
    FilterExpression: `${attrName} = :v`,
    ExpressionAttributeValues: { ':v': value },
    ProjectionExpression: 'emailId',
  })
  await batchDelete(EMAIL_LOGS_TABLE, 'emailId', emails.map((i) => i.emailId as string))
  summary.emailLogs += emails.length
}

async function batchDelete(table: string, pkName: string, ids: string[]): Promise<void> {
  // BatchWriteCommand takes at most 25 items, and may hand some back
  // unprocessed under throttling — those are retried rather than dropped.
  for (let i = 0; i < ids.length; i += 25) {
    let pending: BatchWriteCommandInput['RequestItems'] = {
      [table]: ids.slice(i, i + 25).map((id) => ({ DeleteRequest: { Key: { [pkName]: id } } })),
    }
    for (let attempt = 0; pending && Object.keys(pending).length > 0; attempt++) {
      if (attempt === 5) throw new Error(`[account/delete] ${table}: unprocessed deletes after retries`)
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt))
      const res: BatchWriteCommandOutput = await dynamoDB.send(new BatchWriteCommand({ RequestItems: pending }))
      pending = res.UnprocessedItems
    }
  }
}

export const POST = withMetrics(_POST)
