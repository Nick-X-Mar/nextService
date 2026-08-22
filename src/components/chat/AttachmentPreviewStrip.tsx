'use client'

import { useEffect, useState } from 'react'
import Icon from '@/components/ui/Icon'

interface AttachmentPreviewStripProps {
  files: File[]
  onRemove: (index: number) => void
  disabled?: boolean
}

/**
 * Object URLs for the staged files, created once per file and revoked when the
 * file is removed or the composer unmounts.
 *
 * Calling `URL.createObjectURL` inline in the JSX — as this did — mints a new
 * blob on every single render and never revokes any of them, so typing in the
 * composer leaked one blob per keystroke per staged photo.
 */
function usePreviewUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const created = files.map((file) => URL.createObjectURL(file))
    setUrls(created)
    return () => created.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  // On the render where `files` has changed but the effect has not run yet the
  // two are out of step; rendering a stale URL for a removed file would show
  // the wrong photo, so wait a tick instead.
  return urls.length === files.length ? urls : []
}

/**
 * The staged photos shown above the composer before the message is sent.
 *
 * Without this the attach button gives no feedback at all — which is the state
 * the client chat shipped in: a `+` that appeared to do nothing.
 */
export default function AttachmentPreviewStrip({
  files,
  onRemove,
  disabled = false,
}: AttachmentPreviewStripProps) {
  const urls = usePreviewUrls(files)

  if (files.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-1">
      {files.map((file, index) => (
        <div key={`${file.name}-${file.lastModified}-${index}`} className="relative flex-shrink-0">
          <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-surface-container">
            {urls[index] && (
              // A plain <img>, not next/image: the optimizer proxies through
              // /_next/image, which cannot fetch a blob: URL that only exists
              // in this tab.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[index]}
                alt={file.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>
          <button
            onClick={() => onRemove(index)}
            disabled={disabled}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-tertiary text-white flex items-center justify-center shadow-md disabled:opacity-50 active:scale-95 transition-transform"
            aria-label={`Αφαίρεση ${file.name}`}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      ))}
    </div>
  )
}
