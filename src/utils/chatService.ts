/**
 * Shared chat-message creation.
 *
 * Two routes now write into a thread — `messages` for text and `attachments`
 * for photos — and every one of the rules below is a correctness or privacy
 * rule that must hold on both: which thread a message lands in, who may still
 * write once the job is assigned, which realtime channel it is published to,
 * and when the other side gets an email. Keeping one implementation is what
 * stops the photo path from quietly acquiring a weaker version of them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import appSyncService from '@/lib/appsync-service'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'
import { sendEmail } from '@/utils/emailService'
import { requireAuth, requireActiveGarage, type AuthInfo } from '@/utils/requireAuth'
import { presignAttachmentList, type ChatAttachment } from '@/utils/chatAttachments'
import { invalidateUnread } from '@/utils/unreadCache'
import { garageClientView, quotingFirstName, resolveWinningGarageId } from '@/utils/garageClientView'
import { randomUUID } from 'crypto'
import { chatChannel } from '@/lib/realtime-channels'

export type { ChatAttachment }

/**
 * Who may use the chat routes at all.
 *
 * A pending or deactivated garage still holds a valid garage JWT (login issues
 * one so it can see its pending screen), and the chat is client data — the
 * client's name, their car, whatever they typed. So every chat route goes
 * through this rather than `requireAuth`, and a garage must be approved.
 */
export async function requireChatParticipant(request: NextRequest): Promise<AuthInfo | NextResponse> {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.userType === 'garage') {
    const active = await requireActiveGarage(request)
    if (active instanceof NextResponse) return active
  }
  return auth
}

/** Why a thread no longer takes messages. */
export type ChatReadOnlyReason = 'assigned_elsewhere' | 'cancelled' | 'closed' | 'garage_unavailable'

export interface ThreadWriteState {
  canWrite: boolean
  reason?: ChatReadOnlyReason
}

/**
 * Whether the thread between a request's client and one garage still takes
 * messages — in both directions, because a thread one side can write into and
 * the other cannot answer is worse than a closed one.
 *
 *   pending   → every thread is open: garages ask questions before they bid.
 *   cancelled → none. The job is dead for everyone, the winner included.
 *   otherwise → (appointment, completed, the legacy in-progress) only the
 *               garage that won. The losing garages keep the history but can
 *               neither write nor reach the client by email any more.
 *
 * This used to apply only while the request sat in APPOINTMENT, so the moment
 * a job was completed or cancelled every losing garage could message — and
 * email — the client again.
 *
 * `winnerId` is the garage that won, already resolved (see `resolveWinner`).
 * A missing status is treated as pending: such rows predate the field.
 */
export function threadWriteState(
  status: unknown,
  garageId: string | null,
  winnerId: string | null
): ThreadWriteState {
  if (!status || status === ServiceRequestStatus.PENDING) return { canWrite: true }
  if (status === ServiceRequestStatus.CANCELLED) return { canWrite: false, reason: 'cancelled' }
  if (winnerId && garageId === winnerId) return { canWrite: true }
  return { canWrite: false, reason: winnerId ? 'assigned_elsewhere' : 'closed' }
}

/** The notice a read-only thread shows, worded for whoever is looking at it. */
export function readOnlyNotice(reason: ChatReadOnlyReason, viewer: 'client' | 'garage'): string {
  switch (reason) {
    case 'assigned_elsewhere':
      return viewer === 'garage'
        ? 'Το αίτημα ανατέθηκε σε άλλο συνεργείο. Η συνομιλία είναι πλέον μόνο για ανάγνωση.'
        : 'Το ραντεβού κλείστηκε με άλλο συνεργείο, οπότε αυτή η συνομιλία είναι πλέον μόνο για ανάγνωση.'
    case 'cancelled':
      return 'Το αίτημα ακυρώθηκε, οπότε η συνομιλία είναι πλέον μόνο για ανάγνωση.'
    case 'closed':
      return 'Το αίτημα έκλεισε, οπότε η συνομιλία είναι πλέον μόνο για ανάγνωση.'
    case 'garage_unavailable':
      return viewer === 'garage'
        ? 'Ο λογαριασμός του συνεργείου δεν είναι ενεργός, οπότε η συνομιλία είναι μόνο για ανάγνωση.'
        : 'Το συνεργείο δεν είναι διαθέσιμο αυτή τη στιγμή, οπότε η συνομιλία είναι μόνο για ανάγνωση.'
  }
}

/**
 * The garage that won this request, if any.
 *
 * Prefers the denormalised `acceptedGarageId`; rows booked before that field
 * existed carry only `acceptedOfferId`, and without the fallback the rule above
 * would lock the winning garage out of its own customer.
 */
export async function resolveWinner(request: Record<string, unknown>): Promise<string | null> {
  const direct = request.acceptedGarageId
  if (typeof direct === 'string' && direct) return direct
  const offerId = request.acceptedOfferId
  if (typeof offerId !== 'string' || !offerId) return null
  const res = await dynamoDB.send(new GetCommand({
    TableName: 'Offers',
    Key: { id: offerId },
    ProjectionExpression: 'garageId',
  }))
  return typeof res.Item?.garageId === 'string' ? res.Item.garageId : null
}

/** `resolveWinner`, but only when the status means a winner can matter — saving the read otherwise. */
async function assignedWinner(request: Record<string, unknown>): Promise<string | null> {
  const status = request.status
  const assigned = !!status && status !== ServiceRequestStatus.PENDING && status !== ServiceRequestStatus.CANCELLED
  return assigned ? resolveWinner(request) : null
}

/** Whether an admin has approved this garage and not since deactivated it. */
async function isGarageActive(garageId: string): Promise<boolean> {
  const res = await dynamoDB.send(new GetCommand({
    TableName: 'Garages',
    Key: { id: garageId },
    ProjectionExpression: 'isActive',
  }))
  return res.Item?.isActive === true
}

/**
 * `threadWriteState` for a stored request, resolving the winner only when it
 * matters.
 *
 * For a client it also requires the garage to be active. A pending or
 * deactivated garage is refused every chat route, so nobody would ever read a
 * message written to it — and it used to be emailed one, client's name and
 * all. Its thread is read-only for the client instead, whatever the request's
 * status, which keeps the composer and the server in agreement. (A garage
 * caller is already known to be active: `requireChatParticipant`.)
 */
export async function threadWriteStateFor(
  request: Record<string, unknown>,
  garageId: string | null,
  viewer: 'client' | 'garage'
): Promise<ThreadWriteState> {
  const state = threadWriteState(request.status, garageId, await assignedWinner(request))
  if (!state.canWrite || viewer !== 'client' || !garageId) return state
  return (await isGarageActive(garageId)) ? state : { canWrite: false, reason: 'garage_unavailable' }
}

/**
 * The client's name as one garage may see it.
 *
 * Client PII is winner-only (src/utils/garageClientView.ts holds the rule for
 * every garage-facing response): a garage quoting the job knows the client by
 * first name, and only the garage that won it learns the surname, from
 * acceptance on. `quotingFirstName` also refuses the email's local part, which
 * is what accounts made without a name carry as `firstName`.
 */
function clientNameForGarage(client: Record<string, unknown> | null, isWinner: boolean): string {
  if (!client) return 'Πελάτης'
  if (isWinner) {
    const view = garageClientView(client, true)
    const full = [view?.firstName, view?.lastName].filter(Boolean).join(' ')
    if (full) return full
  }
  return quotingFirstName(client) || 'Πελάτης'
}

/** Whether this garage holds the job — the same test every garage-facing response uses. */
async function garageWonRequest(request: Record<string, unknown>, garageId: string): Promise<boolean> {
  return (await resolveWinningGarageId(request)) === garageId
}

async function loadClientName(clientId: unknown): Promise<Record<string, unknown> | null> {
  if (typeof clientId !== 'string' || !clientId) return null
  const res = await dynamoDB.send(new GetCommand({
    TableName: 'Clients',
    Key: { id: clientId },
    // `email` only so `quotingFirstName` can tell a real first name from the
    // email's local part; it never leaves this module.
    ProjectionExpression: 'firstName, lastName, email',
  }))
  return res.Item ?? null
}

/**
 * Rewrites the client's `senderName` on messages a garage is about to see.
 *
 * Applied on every read rather than at write time, because the stored rows
 * were written with the full name for years, and because the answer changes:
 * a garage that wins the job learns the surname from then on, on its old
 * messages too. The name comes from the Clients row rather than by trimming
 * the stored string, which cannot tell a first name from an email's local part.
 */
export async function redactClientNames<T extends Record<string, unknown>>(
  messages: T[],
  request: Record<string, unknown>,
  garageId: string
): Promise<T[]> {
  if (!messages.some((m) => m.senderType === 'client')) return messages
  const [isWinner, client] = await Promise.all([
    garageWonRequest(request, garageId),
    loadClientName(request.clientId),
  ])
  const name = clientNameForGarage(client, isWinner)
  return messages.map((m) => (m.senderType === 'client' ? { ...m, senderName: name } : m))
}

/**
 * Whether a garage may read the client's pre-thread messages on a request.
 *
 * Client rows written before per-garage threads carry no `garageId`. They were
 * addressed to whoever was listening, so no thread filter can scope them — and
 * the read path used to hand them to any approved garage that opened any
 * request's chat, whatever its status. Now they go only to a garage that was
 * part of the conversation (it bid, or wrote), and once the job has gone to
 * someone, only to the garage that got it.
 */
export async function garageMayReadLegacyMessages(
  request: Record<string, unknown>,
  garageId: string
): Promise<boolean> {
  const status = request.status
  if (status && status !== ServiceRequestStatus.PENDING) {
    return (await resolveWinner(request)) === garageId
  }
  const requestId = request.id as string
  return (
    (await anyMatch({
      TableName: 'Offers',
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :r',
      FilterExpression: 'garageId = :g',
      ExpressionAttributeValues: { ':r': requestId, ':g': garageId },
      ProjectionExpression: 'id',
    })) ||
    (await anyMatch({
      TableName: 'ChatMessages',
      IndexName: 'RequestMessagesIndex',
      KeyConditionExpression: 'requestId = :r',
      FilterExpression: 'senderId = :g AND senderType = :garage',
      ExpressionAttributeValues: { ':r': requestId, ':g': garageId, ':garage': 'garage' },
      ProjectionExpression: 'id',
    }))
  )
}

/** Whether a filtered query matches any row, reading only until the first match. */
async function anyMatch(input: ConstructorParameters<typeof QueryCommand>[0]): Promise<boolean> {
  let startKey: Record<string, unknown> | undefined
  // A request's partition is small; the cap only stops a pathological one
  // from turning a permission check into a long scan. Not found means no.
  for (let page = 0; page < 10; page++) {
    const res = await dynamoDB.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }))
    if ((res.Items?.length ?? 0) > 0) return true
    startKey = res.LastEvaluatedKey
    if (!startKey) return false
  }
  return false
}

export interface ChatMessageRecord {
  id: string
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  senderName: string
  message: string
  timestamp: string
  createdAt: string
  garageId?: string
  attachments?: ChatAttachment[]
}

export type ChatPermissionError = { error: string; status: number; code?: 'CHAT_READ_ONLY' }

export function isChatPermissionError(v: unknown): v is ChatPermissionError {
  return !!v && typeof v === 'object' && 'error' in v && 'status' in v
}

/**
 * Resolve which thread this write belongs to, and whether it is allowed.
 *
 * `garageId` decides both the thread and the realtime channel. Taking it from
 * the request body unchecked would let one garage write into a competitor's
 * conversation and have it appear live in the client's chat with that
 * competitor — so a garage may only ever address its own thread, and only the
 * client (who owns the request) may pick a garage.
 *
 * A client must name the garage. A client row without `garageId` is read back
 * by every garage's thread filter (it is how pre-thread messages stay
 * visible), so letting new ones through would broadcast them to every garage
 * on the request, the losing ones included.
 */
export async function resolveThread(
  auth: AuthInfo,
  request: Record<string, unknown>,
  requestedGarageId: string | null | undefined
): Promise<{ garageId: string } | ChatPermissionError> {
  if (auth.userType === 'client' && request.clientId !== auth.userId) {
    return { error: 'Δεν έχετε πρόσβαση', status: 403 }
  }
  if (auth.userType === 'garage' && requestedGarageId && requestedGarageId !== auth.userId) {
    return { error: 'Δεν έχετε πρόσβαση', status: 403 }
  }

  const garageId = auth.userType === 'garage' ? auth.userId : requestedGarageId
  if (!garageId) {
    return { error: 'Επιλέξτε συνεργείο πριν στείλετε μήνυμα', status: 400 }
  }

  const state = await threadWriteStateFor(request, garageId, auth.userType)
  if (!state.canWrite && state.reason) {
    return { error: readOnlyNotice(state.reason, auth.userType), status: 403, code: 'CHAT_READ_ONLY' }
  }

  return { garageId }
}

/**
 * The sender's name as stored, and as the thread's garage may see it.
 *
 * The row keeps the full name (the client reads it, and so do admin and the
 * GDPR export); what reaches the garage — realtime payload and email — goes
 * through the winner-only rule, the same one the read path applies.
 */
async function resolveSenderNames(
  auth: AuthInfo,
  request: Record<string, unknown>,
  garageId: string
): Promise<{ stored: string; forGarage: string }> {
  if (auth.userType === 'garage') {
    const res = await dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: auth.userId } }))
    const name = (res.Item?.companyName as string) || 'Unknown'
    return { stored: name, forGarage: name }
  }
  const [client, isWinner] = await Promise.all([
    loadClientName(auth.userId),
    garageWonRequest(request, garageId),
  ])
  const firstName = typeof client?.firstName === 'string' ? client.firstName : ''
  const lastName = typeof client?.lastName === 'string' ? client.lastName : ''
  return {
    stored: `${firstName} ${lastName}`.trim() || 'Unknown',
    forGarage: clientNameForGarage(client, isWinner),
  }
}

/**
 * Persist a message, then fan it out: realtime to the thread's channel and an
 * email to whoever is not already reading it.
 */
export async function createChatMessage(args: {
  requestId: string
  request: Record<string, unknown>
  auth: AuthInfo
  message: string
  garageId: string
  attachments?: ChatAttachment[]
}): Promise<ChatMessageRecord> {
  const { requestId, request, auth, message, garageId, attachments } = args

  const names = await resolveSenderNames(auth, request, garageId)
  const senderName = names.stored
  const now = new Date().toISOString()

  const messageData: ChatMessageRecord = {
    id: `msg-${randomUUID()}`,
    requestId,
    senderId: auth.userId,
    senderType: auth.userType,
    senderName,
    message: message.trim(),
    timestamp: now,
    createdAt: now,
    garageId,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }

  await dynamoDB.send(new PutCommand({ TableName: 'ChatMessages', Item: messageData }))

  logEvent({
    eventName: EventName.ChatMessageSent,
    actorType: auth.userType,
    actorId: auth.userId,
    ...(auth.userType === 'client' ? { clientId: auth.userId } : {}),
    garageId,
    requestId,
    source: 'utils/chatService',
    // No `senderName`: `actorId` already says who sent it, and a name here
    // outlived every redaction — the row is keyed on `garageId` too, so it
    // reached a losing garage's GDPR export with the client's surname.
    metadata: {
      messageId: messageData.id,
      length: messageData.message.length,
      attachmentCount: attachments?.length ?? 0,
    },
  })

  notifyByEmail({
    requestId,
    request,
    senderType: auth.userType,
    // The email to a garage names the client the way the garage may see them.
    senderName: auth.userType === 'client' ? names.forGarage : senderName,
    garageId,
    hasAttachments: (attachments?.length ?? 0) > 0,
  }).catch((err) => console.error('[chat] notify failed:', err))

  // What goes over the wire — and back to the sender — carries signed URLs.
  // The stored row holds S3 keys, which a browser cannot render, so publishing
  // `messageData` verbatim would deliver a photo message with no photo in it
  // until the recipient reloaded the thread.
  const wireMessage: ChatMessageRecord = attachments?.length
    ? { ...messageData, attachments: await presignAttachmentList(attachments) }
    : messageData

  // The thread's channel is the garage's as much as the client's, so the copy
  // published there carries the name the garage may see. The client's own
  // window renders the POST response and de-dupes the echo on id.
  try {
    await appSyncService.publishEvent(chatChannel(requestId, garageId), { ...wireMessage, senderName: names.forGarage })
  } catch (error) {
    // Realtime is best-effort — the message is already stored, and the other
    // side will see it on their next fetch.
    console.error('[chat] Error publishing to AppSync Events:', error)
  }

  // The recipient's nav badge and "νέο μήνυμα" banner are computed from this
  // write; drop their cached summary so they appear on the next poll rather
  // than a cache window later.
  const clientId = request.clientId as string | undefined
  if (auth.userType === 'garage' && clientId) invalidateUnread('client', clientId)
  if (auth.userType === 'client') invalidateUnread('garage', garageId)

  return wireMessage
}

const CHAT_EMAIL_COOLDOWN_MS = 15 * 60 * 1000

/**
 * Fire-and-forget "you have a new message" mail to whoever did not send it.
 *
 * Never awaited by the request path: a slow SES call must not delay the message
 * appearing in the sender's own chat window.
 *
 * Two gates make this safe without presence detection. First, we skip anyone
 * whose read marker for this thread is newer than the previous message — if
 * they are reading, they don't need an email. Second, a cooldown per
 * (request, recipient) means a burst of five messages sends one mail, not five.
 */
async function notifyByEmail(args: {
  requestId: string
  request: Record<string, unknown>
  senderType: 'client' | 'garage'
  senderName: string
  garageId: string
  hasAttachments?: boolean
}): Promise<void> {
  const { requestId, request, senderType, senderName, garageId } = args

  const recipientKey = senderType === 'garage' ? 'client' : garageId
  const notifiedAt = (request.chatNotifiedAt || {}) as Record<string, string>
  const lastNotified = notifiedAt[recipientKey]
  if (lastNotified && Date.now() - new Date(lastNotified).getTime() < CHAT_EMAIL_COOLDOWN_MS) {
    return
  }

  const readMap = (senderType === 'garage' ? request.clientReadAt : request.garageReadAt) as
    | Record<string, string>
    | undefined
  const lastRead = readMap?.[garageId]
  if (lastRead && Date.now() - new Date(lastRead).getTime() < CHAT_EMAIL_COOLDOWN_MS) {
    return
  }

  const clientId = request.clientId as string | undefined
  const table = senderType === 'garage' ? 'Clients' : 'Garages'
  const recipientId = senderType === 'garage' ? clientId : garageId
  if (!recipientId) return

  const recipient = await dynamoDB.send(new GetCommand({
    TableName: table,
    Key: { id: recipientId },
    ProjectionExpression: senderType === 'garage' ? 'email' : 'email, isActive',
  }))
  const email = recipient.Item?.email as string | undefined
  if (!email) return
  // A pending or deactivated garage cannot open the chat the email points to.
  // The write path already refuses a client's message to one; this covers a
  // garage deactivated between that check and here.
  if (senderType === 'client' && recipient.Item?.isActive !== true) return

  const chatUrl =
    senderType === 'garage'
      ? `/requests/${clientId}/chats/${requestId}/?garageId=${garageId}`
      : `/garage-dashboard/${garageId}/chat/${requestId}/`

  sendEmail({
    to: email,
    templateName: EmailTemplate.NewChatMessage,
    variables: { senderName, chatUrl },
    triggerEvent: EventName.ChatMessageSent,
    ...(senderType === 'garage' ? { clientId } : { garageId }),
  })

  await dynamoDB.send(new UpdateCommand({
    TableName: 'ServiceRequests',
    Key: { id: requestId },
    UpdateExpression: 'SET chatNotifiedAt = if_not_exists(chatNotifiedAt, :empty)',
    ExpressionAttributeValues: { ':empty': {} },
  }))
  await dynamoDB.send(new UpdateCommand({
    TableName: 'ServiceRequests',
    Key: { id: requestId },
    UpdateExpression: 'SET chatNotifiedAt.#k = :now',
    ExpressionAttributeNames: { '#k': recipientKey },
    ExpressionAttributeValues: { ':now': new Date().toISOString() },
  }))
}
