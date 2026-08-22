'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'

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
 * The photos inside a chat bubble, plus the full-size viewer they open into.
 *
 * A single photo gets a large preview; two or more tile into a square grid,
 * which is what keeps a five-photo message from taking over the thread.
 */
export default function ChatAttachments({ attachments, onOwnBubble = false }: ChatAttachmentsProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const usable = attachments.filter((a) => !!a.url)

  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? i : Math.min(i + 1, usable.length - 1)))
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? i : Math.max(i - 1, 0)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, usable.length])

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

      {lightboxIndex !== null && usable[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-on-surface/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-surface/20 hover:bg-surface/30 flex items-center justify-center transition-colors"
            aria-label="Κλείσιμο"
          >
            <Icon name="close" size="md" className="text-white" />
          </button>

          {usable.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(Math.max(lightboxIndex - 1, 0)) }}
                disabled={lightboxIndex === 0}
                className="absolute left-4 w-10 h-10 rounded-full bg-surface/20 hover:bg-surface/30 flex items-center justify-center disabled:opacity-30 transition-colors"
                aria-label="Προηγούμενη"
              >
                <Icon name="chevron_left" size="md" className="text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(Math.min(lightboxIndex + 1, usable.length - 1)) }}
                disabled={lightboxIndex === usable.length - 1}
                className="absolute right-4 w-10 h-10 rounded-full bg-surface/20 hover:bg-surface/30 flex items-center justify-center disabled:opacity-30 transition-colors"
                aria-label="Επόμενη"
              >
                <Icon name="chevron_right" size="md" className="text-white" />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- the presigned
              URL is short-lived and single-use here, so routing it through the
              image optimiser would only add a cache entry nothing can reuse. */}
          <img
            src={usable[lightboxIndex].url}
            alt={usable[lightboxIndex].originalName || 'Φωτογραφία'}
            className="max-h-[85vh] max-w-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />

          {usable.length > 1 && (
            <div className="absolute bottom-6 text-white/80 text-xs font-bold tracking-widest">
              {lightboxIndex + 1} / {usable.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
