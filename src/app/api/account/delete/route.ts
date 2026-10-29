import { NextRequest, NextResponse } from 'next/server'
import {
  ScanCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
  type BatchWriteCommandInput,
  type BatchWriteCommandOutput,
  type QueryCommandInput,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { verifyPassword } from '@/utils/passwordService'
import { deleteFileFromS3, extractS3KeyFromUrl } from '@/utils/s3Service'
import { requireAuth, invalidateGarageActive } from '@/utils/requireAuth'
import { clearAuthCookie } from '@/utils/auth'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import { broadcastRequestUpdate } from '@/utils/requestBroadcast'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

/** What a closed client's chat messages read as once their text is gone. */
const REMOVED_MESSAGE = 'Το μήνυμα διαγράφηκε'

/**
 * The attributes a closed client or garage row keeps. Everything else on the
 * row is removed — an allowlist rather than a list of known personal fields,
 * so a field added later is erased by default instead of surviving by default.
 *
 * A garage keeps its business identity (επωνυμία, ΑΦΜ, ΔΟΥ, διεύθυνση) and its
 * rate: the commission it owes for jobs already done is invoiced to that
 * business, and tax law requires the record. The people behind it — contact
 * name, mobile, login email — go.
 */
const CLIENT_KEEPS = new Set(['id', 'createdAt', 'ratingCount', 'ratingSum'])
const GARAGE_KEEPS = new Set([
  'id', 'createdAt', 'companyName', 'tin', 'taxAuthority', 'address', 'activatedAt', 'deactivatedAt',
  'commissionPercent', 'commissionPercentSetAt', 'commissionPercentSetBy', 'ratingCount', 'ratingSum',
])
/** The car stays as make and model; everything that identifies the actual vehicle or its owner goes. */
const VEHICLE_KEEPS = new Set([
  'id', 'clientId', 'brand', 'model', 'year', 'modelYear', 'engineCC', 'fuelType',
  'isAutomatic', 'is4x4', 'isTurbo', 'isBrandOther', 'isModelOther', 'createdAt', 'updatedAt',
])

interface CloseSummary {
  requestsCancelled: number
  requestsAnonymized: number
  vehiclesAnonymized: number
  chatMessagesAnonymized: number
  offersWithdrawn: number
  s3Objects: number
  emailLogs: number
}

/**
 * POST /api/account/delete — "Διαγραφή λογαριασμού".
 *
 * Body: { password }
 *
 * Closes the account and **anonymizes** it; nothing is hard-deleted. The job
 * history — requests, offers, declared amounts, the commission billed on them,
 * ratings — stays, so a garage's invoiced months and a client's counterpart
 * history do not change under anyone. Everything that identifies the person is
 * removed: login, name, contact details, the car's plate/VIN/engine number,
 * request descriptions, their chat messages and every photo they uploaded (the
 * άδεια included, deleted from S3). What remains no longer relates to an
 * identifiable person, which is what GDPR erasure requires.
 *
 * Refused while the account has a booking that has not started yet: that has
 * to be cancelled first, so the other side is told through the normal flow.
 */
async function _POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { userId, userType } = auth
    if (userType !== 'client' && userType !== 'garage') {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const password = body && typeof body === 'object' ? (body as { password?: unknown }).password : undefined
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Πρέπει να επιβεβαιώσεις τον κωδικό σου για τη διαγραφή' },
        { status: 400 }
      )
    }

    const tableName = userType === 'garage' ? TABLES.Garages : TABLES.Clients
    const user = (await dynamoDB.send(new GetCommand({ TableName: tableName, Key: { id: userId } }))).Item
    if (!user || user.anonymizedAt) {
      return NextResponse.json({ error: 'Ο λογαριασμός δεν βρέθηκε' }, { status: 404 })
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'Ο λογαριασμός δεν έχει κωδικό. Επικοινώνησε με την υποστήριξη.' },
        { status: 400 }
      )
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Λάθος κωδικός' }, { status: 401 })
    }

    const summary: CloseSummary = {
      requestsCancelled: 0,
      requestsAnonymized: 0,
      vehiclesAnonymized: 0,
      chatMessagesAnonymized: 0,
      offersWithdrawn: 0,
      s3Objects: 0,
      emailLogs: 0,
    }

    const blocked = userType === 'client'
      ? await closeClient(userId, summary)
      : await closeGarage(userId, summary)
    if (blocked) return blocked

    await wipeEmailLogs(userType === 'client' ? 'clientId' : 'garageId', userId, summary)
    await anonymizeRow(tableName, user, userType === 'client' ? CLIENT_KEEPS : GARAGE_KEEPS)
    if (userType === 'garage') invalidateGarageActive(userId)

    await logEvent({
      eventName: EventName.AccountDeleted,
      actorType: userType,
      actorId: userId,
      ...(userType === 'client' ? { clientId: userId } : { garageId: userId }),
      metadata: { anonymized: summary },
    })

    const response = NextResponse.json({
      success: true,
      message: 'Ο λογαριασμός σου έκλεισε και τα προσωπικά σου στοιχεία διαγράφηκαν',
      summary,
    })
    clearAuthCookie(response)
    return response
  } catch (err) {
    console.error('[account/delete] error:', err)
    return NextResponse.json(
      { error: 'Σφάλμα κατά τη διαγραφή του λογαριασμού' },
      { status: 500 }
    )
  }
}

type Row = Record<string, unknown>

/** A booking that has not started — the account cannot close over it. */
function upcomingAppointmentRefusal(): NextResponse {
  return NextResponse.json(
    {
      error: 'Έχεις κλεισμένο ραντεβού που δεν έχει γίνει ακόμη. Ακύρωσέ το πρώτα, ώστε να ενημερωθεί η άλλη πλευρά, και μετά διέγραψε τον λογαριασμό.',
      code: 'UPCOMING_APPOINTMENT',
    },
    { status: 409 }
  )
}

const isUpcoming = (r: Row) =>
  r.status === ServiceRequestStatus.APPOINTMENT &&
  !hasAppointmentStarted(r.appointmentDate as string | undefined, r.appointmentTime as string | undefined)

async function closeClient(clientId: string, summary: CloseSummary): Promise<NextResponse | null> {
  const requests = await queryAll({
    TableName: TABLES.ServiceRequests,
    IndexName: 'ClientRequestsIndex',
    KeyConditionExpression: 'clientId = :c',
    ExpressionAttributeValues: { ':c': clientId },
  })
  if (requests.some(isUpcoming)) return upcomingAppointmentRefusal()

  const vehicles = await queryAll({
    TableName: TABLES.Vehicles,
    IndexName: 'ClientVehiclesIndex',
    KeyConditionExpression: 'clientId = :c',
    ExpressionAttributeValues: { ':c': clientId },
  })

  const s3Keys: string[] = []
  const now = new Date().toISOString()

  for (const req of requests) {
    const requestId = req.id as string

    // An open request leaves the market: nobody can quote a client who is gone.
    if (req.status === ServiceRequestStatus.PENDING) {
      try {
        await dynamoDB.send(new UpdateCommand({
          TableName: TABLES.ServiceRequests,
          Key: { id: requestId },
          UpdateExpression: 'SET #s = :cancelled, cancelledAt = :now, cancelledBy = :by, cancelReason = :why, updatedAt = :now',
          ConditionExpression: '#s = :pending',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':cancelled': ServiceRequestStatus.CANCELLED,
            ':pending': ServiceRequestStatus.PENDING,
            ':now': now,
            ':by': 'client',
            ':why': 'account_closed',
          },
        }))
        summary.requestsCancelled++
        await rejectPendingOffers(requestId, summary)
        await broadcastRequestUpdate(requestId, ServiceRequestStatus.CANCELLED, 'account_closed')
      } catch (err) {
        // Accepted a moment ago: it is a booking now, refuse rather than strand the garage.
        if (err instanceof ConditionalCheckFailedException) return upcomingAppointmentRefusal()
        throw err
      }
    }

    s3Keys.push(...requestPhotoKeys(req))

    // Their side of every conversation: the text, the photos and the name go.
    const messages = await queryAll({
      TableName: TABLES.ChatMessages,
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :r',
      ExpressionAttributeValues: { ':r': requestId },
    })
    for (const msg of messages) {
      if (msg.senderType !== 'client') continue
      s3Keys.push(...attachmentKeys(msg))
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.ChatMessages,
        Key: { id: msg.id },
        UpdateExpression: 'SET message = :removed, senderName = :anon, anonymizedAt = :now REMOVE attachments',
        ExpressionAttributeValues: { ':removed': REMOVED_MESSAGE, ':anon': 'Πελάτης', ':now': now },
      }))
      summary.chatMessagesAnonymized++
    }

    // The job stays — category, car, dates, prices, outcome — without the
    // free text and photos that could say who it was for.
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      UpdateExpression: 'SET anonymizedAt = :now, updatedAt = :now REMOVE description, photoUrls, photos',
      ExpressionAttributeValues: { ':now': now },
    }))
    summary.requestsAnonymized++
  }

  for (const vehicle of vehicles) {
    const key = s3KeyOf(vehicle.licensePhotoUrl)
    if (key) s3Keys.push(key)
    await anonymizeRow(TABLES.Vehicles, vehicle, VEHICLE_KEEPS)
    summary.vehiclesAnonymized++
  }

  await deleteS3Objects(s3Keys, summary)
  return null
}

async function closeGarage(garageId: string, summary: CloseSummary): Promise<NextResponse | null> {
  const offers = await queryAll({
    TableName: TABLES.Offers,
    IndexName: 'GarageOffersIndex',
    KeyConditionExpression: 'garageId = :g',
    ExpressionAttributeValues: { ':g': garageId },
  })

  // A booking still ahead has a client counting on it.
  const acceptedRequestIds = offers
    .filter((o) => o.status === OfferStatus.ACCEPTED)
    .map((o) => o.serviceRequestId as string)
  for (const requestId of acceptedRequestIds) {
    const req = (await dynamoDB.send(new GetCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      ProjectionExpression: '#s, appointmentDate, appointmentTime',
      ExpressionAttributeNames: { '#s': 'status' },
    }))).Item
    if (req && isUpcoming(req)) return upcomingAppointmentRefusal()
  }

  // Quotes still waiting on a client are withdrawn; the rest is history.
  const now = new Date().toISOString()
  for (const offer of offers) {
    if (offer.status !== OfferStatus.PENDING) continue
    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Offers,
        Key: { id: offer.id },
        UpdateExpression: 'SET #s = :expired, withdrawnAt = :now, updatedAt = :now',
        ConditionExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':expired': OfferStatus.EXPIRED, ':pending': OfferStatus.PENDING, ':now': now },
      }))
      summary.offersWithdrawn++
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err
    }
  }

  // Off the marketplace for good; the activate route refuses a closed garage.
  await dynamoDB.send(new UpdateCommand({
    TableName: TABLES.Garages,
    Key: { id: garageId },
    UpdateExpression: 'SET isActive = :f, deactivatedAt = :now',
    ExpressionAttributeValues: { ':f': false, ':now': now },
  }))
  return null
}

async function rejectPendingOffers(requestId: string, summary: CloseSummary): Promise<void> {
  const offers = await queryAll({
    TableName: TABLES.Offers,
    IndexName: 'ServiceRequestOffersIndex',
    KeyConditionExpression: 'serviceRequestId = :r',
    ExpressionAttributeValues: { ':r': requestId },
    ProjectionExpression: 'id, #s',
    ExpressionAttributeNames: { '#s': 'status' },
  })
  for (const offer of offers) {
    if (offer.status !== OfferStatus.PENDING) continue
    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.Offers,
        Key: { id: offer.id },
        UpdateExpression: 'SET #s = :rejected, updatedAt = :now',
        ConditionExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':rejected': OfferStatus.REJECTED, ':pending': OfferStatus.PENDING, ':now': new Date().toISOString() },
      }))
      summary.offersWithdrawn++
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err
    }
  }
}

/**
 * Strips a row down to `keeps` and stamps it anonymized. The account rows are
 * also set inactive, so a closed account can never sign in or be reactivated;
 * the email and phone GSIs drop it as their keys disappear, freeing both for a
 * new registration.
 */
async function anonymizeRow(table: string, row: Row, keeps: Set<string>): Promise<void> {
  const isAccount = table === TABLES.Clients || table === TABLES.Garages
  // The fields SET below cannot also be removed in the same expression.
  const setHere = new Set(['anonymizedAt', 'updatedAt', ...(isAccount ? ['isActive'] : [])])
  const remove = Object.keys(row).filter((k) => !keeps.has(k) && !setHere.has(k))
  const names: Record<string, string> = {}
  remove.forEach((k, i) => { names[`#r${i}`] = k })
  const now = new Date().toISOString()
  await dynamoDB.send(new UpdateCommand({
    TableName: table,
    Key: { id: row.id },
    UpdateExpression:
      'SET anonymizedAt = :now, updatedAt = :now' +
      (isAccount ? ', isActive = :f' : '') +
      (remove.length ? ` REMOVE ${remove.map((_, i) => `#r${i}`).join(', ')}` : ''),
    ...(remove.length ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: { ':now': now, ...(isAccount ? { ':f': false } : {}) },
  }))
}

/** The mail log holds the address each message went to — operational only, so it goes. */
async function wipeEmailLogs(attrName: 'clientId' | 'garageId', value: string, summary: CloseSummary): Promise<void> {
  const emails = await scanAll({
    TableName: TABLES.EmailLogs,
    FilterExpression: `${attrName} = :v`,
    ExpressionAttributeValues: { ':v': value },
    ProjectionExpression: 'emailId',
  })
  await batchDelete(TABLES.EmailLogs, 'emailId', emails.map((i) => i.emailId as string))
  summary.emailLogs += emails.length
}

/**
 * Every page of a Query or Scan. A single call stops at 1 MB of data read, so
 * on the shared tables — where one user's rows are a sliver of the whole — it
 * would leave most of them behind and still report success.
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
 * Request photos live in `photoUrls` (keys). Older rows may still carry
 * `photos: [{ s3Key | s3Url }]`.
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

async function deleteS3Objects(keys: Iterable<string>, summary: CloseSummary): Promise<void> {
  for (const key of new Set(keys)) {
    // deleteFileFromS3 reports failure in its result rather than throwing.
    const res = await deleteFileFromS3(key)
    if (res.success) summary.s3Objects++
    else console.error('[account/delete] failed to delete S3 object:', key, res.error)
  }
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
