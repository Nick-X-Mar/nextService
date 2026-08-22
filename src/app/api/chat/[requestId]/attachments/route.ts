import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { createChatMessage, resolveThread, isChatPermissionError } from '@/utils/chatService'
import type { ChatAttachment } from '@/utils/chatAttachments'
import {
  uploadMultipleFilesToS3,
  validateFile,
  isS3Configured,
  ACCEPTED_IMAGE_TYPES,
} from '@/utils/s3Service'
import { randomUUID } from 'crypto'

const checkAttachmentRate = createRateLimiter('chat-attachment', 60, 3600000)

const MAX_SIZE_MB = 15
const MAX_FILES_PER_MESSAGE = 5

/**
 * Send a photo into a chat thread.
 *
 * Upload and message creation are one call on purpose. Splitting them would
 * leave orphaned objects in S3 whenever someone closed the tab between the
 * two, and would mean accepting S3 keys from the client on the send call —
 * which is a way to attach somebody else's file to your own message.
 *
 * Scope: the message is written into `request-{requestId}-garage-{garageId}`,
 * the same per-garage thread the text messages use. A client's photo therefore
 * reaches only the garage they are talking to; the read path filters on the
 * same `garageId`, so no other garage on the request can query it back.
 */
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!checkAttachmentRate(auth.userId)) {
      return NextResponse.json(
        { error: 'Πολλά αρχεία. Δοκιμάστε ξανά αργότερα.' },
        { status: 429 }
      )
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'S3 service not configured.' },
        { status: 500 }
      )
    }

    const { requestId } = await params
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const caption = (formData.get('message') as string | null) ?? ''
    const requestedGarageId = (formData.get('garageId') as string | null) ?? null

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Δεν στάλθηκε κανένα αρχείο' }, { status: 400 })
    }

    const requestResult = await dynamoDB.send(new GetCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
    }))
    if (!requestResult.Item) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    const thread = resolveThread(auth, requestResult.Item, requestedGarageId)
    if (isChatPermissionError(thread)) {
      return NextResponse.json({ error: thread.error }, { status: thread.status })
    }

    // Without a garage the message has no thread to belong to, so it would be
    // stored where the per-garage read filter can never scope it. A photo with
    // no addressee is exactly the "visible to nobody" case being fixed here.
    if (!thread.garageId) {
      return NextResponse.json(
        { error: 'Επιλέξτε συνεργείο πριν στείλετε φωτογραφία' },
        { status: 400 }
      )
    }

    // Per-file validation: one oversized photo must not discard the rest.
    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of files.slice(0, MAX_FILES_PER_MESSAGE)) {
      const validation = validateFile(file, MAX_SIZE_MB, ACCEPTED_IMAGE_TYPES)
      if (validation.valid) accepted.push(file)
      else rejected.push(`${file.name}: ${validation.error}`)
    }
    if (files.length > MAX_FILES_PER_MESSAGE) {
      rejected.push(`Στάλθηκαν οι πρώτες ${MAX_FILES_PER_MESSAGE} φωτογραφίες.`)
    }

    if (accepted.length === 0) {
      return NextResponse.json(
        { error: 'Καμία φωτογραφία δεν ήταν έγκυρη', details: rejected },
        { status: 400 }
      )
    }

    // Keyed by thread, so the storage layout mirrors the visibility rule.
    const folder = `Chat/${requestId}/${thread.garageId}`
    const uploadResults = await uploadMultipleFilesToS3(accepted, folder)

    const attachments: ChatAttachment[] = []
    uploadResults.forEach((result, i) => {
      const file = accepted[i]
      if (!result.success || !result.key) {
        rejected.push(`${file.name}: ${result.error || 'upload failed'}`)
        return
      }
      attachments.push({
        id: `att-${randomUUID()}`,
        s3Key: result.key,
        originalName: file.name,
        contentType: file.type,
        fileSize: file.size,
      })
    })

    if (attachments.length === 0) {
      return NextResponse.json(
        { error: 'Η αποστολή απέτυχε', details: rejected },
        { status: 502 }
      )
    }

    const messageData = await createChatMessage({
      requestId,
      request: requestResult.Item,
      auth,
      // The bubble renders the photos; a caption is optional, and the fallback
      // gives the chat list something to show as the thread's last message.
      message: caption.trim() || (attachments.length > 1 ? '📷 Φωτογραφίες' : '📷 Φωτογραφία'),
      garageId: thread.garageId,
      attachments,
    })

    return NextResponse.json({
      success: true,
      message: messageData,
      rejected,
    })

  } catch (error) {
    console.error('Error uploading chat attachment:', error)
    return NextResponse.json(
      { error: 'Error uploading chat attachment', details: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
