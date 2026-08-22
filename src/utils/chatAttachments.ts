/**
 * Turning stored chat attachments into something a browser can render.
 *
 * Attachments persist as S3 keys against a private bucket, so every read has
 * to mint a presigned URL. Kept out of `chatService.ts` because that module is
 * the write path and this one is imported by the read path and the realtime
 * publish.
 */
import { getPresignedDownloadUrl } from '@/utils/s3Service'

/**
 * A photo attached to a chat message.
 *
 * Only the S3 key is persisted. The bucket is private, so readers get a
 * short-lived presigned URL minted per request — storing a URL would bake in
 * an expiry that outlives its own validity, and making the object public would
 * put a customer's damage photos on a guessable URL.
 */
export interface ChatAttachment {
  id: string
  s3Key: string
  originalName: string
  contentType: string
  fileSize: number
}

export interface PresignedChatAttachment extends ChatAttachment {
  url: string
}

/**
 * Presign the attachments on a page of messages.
 *
 * One signature per attachment, all in flight together — signing is a local
 * HMAC with no network call, so the cost is negligible next to the DynamoDB
 * read that produced these rows.
 */
export async function presignChatAttachments<T extends Record<string, unknown>>(
  messages: T[],
  expiresIn: number = 3600
): Promise<T[]> {
  return Promise.all(
    messages.map(async (msg) => {
      const attachments = msg.attachments as ChatAttachment[] | undefined
      if (!attachments || attachments.length === 0) return msg

      const presigned = await Promise.all(
        attachments.map(async (a): Promise<PresignedChatAttachment> => ({
          ...a,
          url: await getPresignedDownloadUrl(a.s3Key, expiresIn),
        }))
      )
      return { ...msg, attachments: presigned }
    })
  )
}

/** Presign the attachments of a single message. */
export async function presignAttachmentList(
  attachments: ChatAttachment[],
  expiresIn: number = 3600
): Promise<PresignedChatAttachment[]> {
  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      url: await getPresignedDownloadUrl(a.s3Key, expiresIn),
    }))
  )
}
