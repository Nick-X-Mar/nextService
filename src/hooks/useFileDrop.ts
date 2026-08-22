'use client'

import { useEffect, useRef, useState } from 'react'

interface UseFileDropOptions {
  /** Stop accepting files (e.g. the photo limit is reached). The navigation
   *  guard stays active regardless — see below. */
  disabled?: boolean
  /** Narrow what counts, e.g. images only. */
  accept?: (file: File) => boolean
}

/**
 * Page-wide file drag & drop.
 *
 * Listens on `window` rather than on a single element for one reason: a file
 * dropped anywhere the page does *not* handle makes the browser navigate away
 * and render the file instead — the tab is replaced by the photo, and whatever
 * the user had filled in is gone. Scoping the handlers to a small dashed box
 * meant every near-miss did exactly that.
 *
 * So the drop is always prevented, even when `disabled`, and the whole window
 * is a valid target. `dragActive` is exposed for the drop zone's highlight.
 */
export function useFileDrop(
  onFiles: (files: File[]) => void,
  options: UseFileDropOptions = {}
) {
  const { disabled = false, accept } = options
  const [dragActive, setDragActive] = useState(false)

  // dragenter/dragleave fire for every child element the cursor crosses, so a
  // plain boolean flickers. Counting entries and exits is what keeps the
  // highlight steady while the pointer moves over the zone's contents.
  const depth = useRef(0)
  const onFilesRef = useRef(onFiles)
  const acceptRef = useRef(accept)

  useEffect(() => { onFilesRef.current = onFiles }, [onFiles])
  useEffect(() => { acceptRef.current = accept }, [accept])

  useEffect(() => {
    // Dragging selected text or a link also fires these events; only react to
    // an actual file payload.
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      if (!disabled) setDragActive(true)
    }

    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      // Without preventDefault here the browser treats the page as an invalid
      // drop target, and the subsequent drop navigates to the file.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragActive(false)
    }

    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragActive(false)
      if (disabled) return

      const files = Array.from(e.dataTransfer?.files ?? [])
      const filtered = acceptRef.current ? files.filter(acceptRef.current) : files
      if (filtered.length > 0) onFilesRef.current(filtered)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      depth.current = 0
    }
  }, [disabled])

  return { dragActive }
}
