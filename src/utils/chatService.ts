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
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import appSyncService from '@/lib/appsync-service'
import { ServiceRequestStatus } from '@/types/statuses'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'
import { sendEmail } from '@/utils/emailService'
import type { AuthInfo } from '@/utils/requireAuth'
import { presignAttachmentList, type ChatAttachment } from '@/utils/chatAttachments'
import { randomUUID } from 'crypto'

export type { ChatAttachment }

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

export type ChatPermissionError = { error: string; status: number }

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
 */
export function resolveThread(
  auth: AuthInfo,
  request: Record<string, unknown>,
  requestedGarageId: string | null | undefined
): { garageId: string | null } | ChatPermissionError {
  if (auth.userType === 'client' && request.clientId !== auth.userId) {
    return { error: 'Δεν έχετε πρόσβαση', status: 403 }
  }
  if (auth.userType === 'garage' && requestedGarageId && requestedGarageId !== auth.userId) {
    return { error: 'Δεν έχετε πρόσβαση', status: 403 }
  }

  const garageId = auth.userType === 'garage' ? auth.userId : (requestedGarageId || null)

  // Once the job is assigned, only the two parties actually doing it keep
  // talking. Everyone else — the garages whose offers were rejected — can read
  // the history but neither sends nor receives anything more.
  if (request.status === ServiceRequestStatus.APPOINTMENT) {
    const acceptedGarageId = request.acceptedGarageId as string | undefined
    const isPartOfAppointment = acceptedGarageId ? garageId === acceptedGarageId : false
    if (!isPartOfAppointment) {
      return {
        error:
          auth.userType === 'garage'
            ? 'Το αίτημα ανατέθηκε σε άλλο συνεργείο. Η συνομιλία είναι πλέον μόνο για ανάγνωση.'
            : 'Η συνομιλία με αυτό το συνεργείο είναι μόνο για ανάγνωση — το ραντεβού κλείστηκε με άλλο συνεργείο.',
        status: 403,
      }
    }
  }

  return { garageId }
}

async function resolveSenderName(auth: AuthInfo): Promise<string> {
  if (auth.userType === 'garage') {
    const res = await dynamoDB.send(new GetCommand({ TableName: 'Garages', Key: { id: auth.userId } }))
    return (res.Item?.companyName as string) || 'Unknown'
  }
  const res = await dynamoDB.send(new GetCommand({ TableName: 'Clients', Key: { id: auth.userId } }))
  if (!res.Item) return 'Unknown'
  return `${res.Item.firstName} ${res.Item.lastName || ''}`.trim() || 'Unknown'
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
  garageId: string | null
  attachments?: ChatAttachment[]
}): Promise<ChatMessageRecord> {
  const { requestId, request, auth, message, garageId, attachments } = args

  const senderName = await resolveSenderName(auth)
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
    ...(garageId ? { garageId } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }

  await dynamoDB.send(new PutCommand({ TableName: 'ChatMessages', Item: messageData }))

  logEvent({
    eventName: EventName.ChatMessageSent,
    actorType: auth.userType,
    actorId: auth.userId,
    ...(auth.userType === 'client' ? { clientId: auth.userId } : {}),
    ...(garageId ? { garageId } : {}),
    requestId,
    source: 'utils/chatService',
    metadata: {
      messageId: messageData.id,
      senderName,
      length: messageData.message.length,
      attachmentCount: attachments?.length ?? 0,
    },
  })

  notifyByEmail({
    requestId,
    request,
    senderType: auth.userType,
    senderName,
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

  if (garageId) {
    const channelName = `request-${requestId}-garage-${garageId}`
    try {
      await appSyncService.publishEvent(channelName, { ...wireMessage })
    } catch (error) {
      // Realtime is best-effort — the message is already stored, and the other
      // side will see it on their next fetch.
      console.error('[chat] Error publishing to AppSync Events:', error)
    }
  }

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
  garageId: string | null
  hasAttachments?: boolean
}): Promise<void> {
  const { requestId, request, senderType, senderName, garageId } = args
  if (!garageId) return

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

  const recipient = await dynamoDB.send(new GetCommand({ TableName: table, Key: { id: recipientId } }))
  const email = recipient.Item?.email as string | undefined
  if (!email) return

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
