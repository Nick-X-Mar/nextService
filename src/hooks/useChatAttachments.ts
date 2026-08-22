'use client'

import { useCallback, useState } from 'react'
import { compressImages } from '@/utils/imageCompression'

export const MAX_CHAT_ATTACHMENTS = 5

/**
 * Pending-photo state for a chat composer, shared by the client and garage
 * chat pages.
 *
 * Files are staged here and only uploaded when the message is sent, so the
 * upload and the message it belongs to are a single request — nothing can end
 * up in S3 attached to a message that was never created.
 */
export function useChatAttachments() {
  const [pending, setPending] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setPending((prev) => [...prev, ...images].slice(0, MAX_CHAT_ATTACHMENTS))
  }, [])

  const removeFile = useCallback((index: number) => {
    setPending((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setPending([]), [])

  /**
   * Compress, upload and post as one message.
   *
   * Compression runs here rather than at pick time so the preview stays
   * instant and a photo the user removes before sending is never processed.
   */
  const upload = useCallback(
    async (args: { requestId: string; garageId: string; caption?: string }) => {
      if (pending.length === 0) {
        return { ok: true as const, rejected: [] as string[], message: undefined }
      }

      setUploading(true)
      try {
        const compressed = await compressImages(pending)
        const form = new FormData()
        compressed.forEach((file) => form.append('files', file))
        form.append('garageId', args.garageId)
        if (args.caption) form.append('message', args.caption)

        const response = await fetch(`/api/chat/${args.requestId}/attachments/`, {
          method: 'POST',
          body: form,
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          return {
            ok: false as const,
            error: (data.error as string) || 'Η αποστολή της φωτογραφίας απέτυχε',
          }
        }

        setPending([])
        // The created row comes back with presigned URLs already on it, so
        // callers can append it optimistically instead of waiting for the
        // realtime echo — which never arrives if the socket happens to be down.
        return {
          ok: true as const,
          rejected: (data.rejected as string[]) || [],
          message: data.message as Record<string, unknown> | undefined,
        }
      } catch {
        return { ok: false as const, error: 'Η αποστολή της φωτογραφίας απέτυχε' }
      } finally {
        setUploading(false)
      }
    },
    [pending]
  )

  return {
    pending,
    uploading,
    addFiles,
    removeFile,
    clear,
    upload,
    hasPending: pending.length > 0,
    isFull: pending.length >= MAX_CHAT_ATTACHMENTS,
  }
}
