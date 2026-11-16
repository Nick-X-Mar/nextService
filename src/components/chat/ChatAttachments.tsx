'use client'

import { useState } from 'react'
import Image from 'next/image'
import PhotoViewer from '@/components/PhotoViewer'

export interface ChatAttachmentView {
  id: string
  url?: string
  originalName?: string
  contentType?: string
}

interface ChatAttachmentsProps {
  attachments: ChatAttachmentView[]
  /** Sent-by-me bubbles are amber, so their overlays need the light treatment. */
  onOwnBubble?: boolean
}

/**
 * The photos inside a chat bubble; a tap opens them in the PhotoViewer.
 *
 * A single photo gets a large preview; two or more tile into a square grid,
 * which is what keeps a five-photo message from taking over the thread.
 */
export default function ChatAttachments({ attachments, onOwnBubble = false }: ChatAttachmentsProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const usable = attachments.filter((a) => !!a.url)

  if (usable.length === 0) return null

  const single = usable.length === 1

  return (
    <>
      <div className={`grid gap-1.5 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {usable.map((attachment, index) => (
          <button
            key={attachment.id}
            onClick={() => setLightboxIndex(index)}
            className={`relative overflow-hidden rounded-lg bg-surface-container active:scale-95 transition-transform ring-1 ${
              // A hairline keeps a light photo from bleeding into the amber
              // gradient of a sent bubble, and a dark one off the grey of a
              // received bubble.
              onOwnBubble ? 'ring-white/25' : 'ring-outline-variant/20'
            } ${single ? 'aspect-[4/3] w-56 max-w-full' : 'aspect-square'}`}
            aria-label={`Άνοιγμα φωτογραφίας ${index + 1}`}
          >
            <Image
              src={attachment.url as string}
              alt={attachment.originalName || `Φωτογραφία ${index + 1}`}
              fill
              sizes="(max-width: 640px) 50vw, 224px"
              className="object-cover"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoViewer
          photos={usable.map((a, i) => ({ url: a.url as string, alt: a.originalName || `Φωτογραφία ${i + 1}` }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
