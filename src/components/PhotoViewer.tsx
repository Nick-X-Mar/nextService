'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/ui/Icon'

export interface ViewerPhoto {
  url: string
  alt: string
}

interface PhotoViewerProps {
  photos: ViewerPhoto[]
  /** The photo it opens on. */
  startIndex: number
  onClose: () => void
}

/** A swipe counts past either of these: far enough, or a quick flick (px/ms). */
const SWIPE_DISTANCE = 50
const SWIPE_VELOCITY = 0.3
/** Movement under this is a tap, not a drag. */
const TAP_SLOP = 8
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SCALE = 2.5
const MAX_SCALE = 4
const NO_ZOOM = { scale: 1, x: 0, y: 0 }

type Zoom = typeof NO_ZOOM

interface Drag {
  startX: number
  startY: number
  lastX: number
  lastTime: number
  velocityX: number
  moved: boolean
  onImage: boolean
  zoomX: number
  zoomY: number
}

/**
 * Every photo in the app opens here, over the page instead of in a new tab:
 * the request's photos, the άδεια, chat attachments. Swipe or drag sideways,
 * or the arrows and ←/→, to move between them; Esc, ✕ or a tap beside the
 * photo closes it.
 *
 * It zooms (two fingers, or a double tap / double click), because the tab it
 * replaces could: garages read the πλαίσιο and the αρ. κινητήρα off the άδεια.
 * While zoomed, a drag moves the photo instead of changing it.
 *
 * Rendered into <body>, so no card's overflow or transform can clip it. React
 * still bubbles its events to the component that opened it, which is why the
 * root stops clicks: a viewer opened from a clickable card would otherwise
 * click the card. (Not keys: stopped there, they never reach the window.)
 */
export default function PhotoViewer({ photos, startIndex, onClose }: PhotoViewerProps) {
  const last = photos.length - 1
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), last))
  const [dragX, setDragX] = useState(0)
  const [gesturing, setGesturing] = useState(false)
  const [zoom, setZoomState] = useState<Zoom>(NO_ZOOM)
  const zoomRef = useRef<Zoom>(NO_ZOOM)
  const stageRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<Drag | null>(null)
  const pinch = useRef<{ distance: number; zoom: Zoom } | null>(null)
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null)
  // Closing on the click, not the pointerup: gone before its click, the viewer
  // would hand that click to whatever is underneath.
  const closeOnClick = useRef(false)

  const setZoom = (next: Zoom) => {
    const stage = stageRef.current
    let { x, y } = next
    if (stage) {
      const maxX = ((next.scale - 1) * stage.clientWidth) / 2
      const maxY = ((next.scale - 1) * stage.clientHeight) / 2
      x = Math.min(Math.max(x, -maxX), maxX)
      y = Math.min(Math.max(y, -maxY), maxY)
    }
    zoomRef.current = { scale: next.scale, x, y }
    setZoomState(zoomRef.current)
  }

  const go = (to: number) => {
    if (to < 0 || to > last) return
    setIndex(to)
    setDragX(0)
    setZoom(NO_ZOOM)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    // Captured, so nothing on the page under it can swallow the key first.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // go only reads index and last
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, last, onClose])

  // The page underneath stays where it was, and focus returns to the photo that
  // opened this. Focus goes to the viewer itself, not its ✕: Safari rings a
  // button focused from a script even after a tap.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const toggleZoom = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (zoomRef.current.scale > 1 || !stage) {
      setZoom(NO_ZOOM)
      return
    }
    // Keep the tapped point under the finger.
    const rect = stage.getBoundingClientRect()
    const cx = clientX - (rect.left + rect.width / 2)
    const cy = clientY - (rect.top + rect.height / 2)
    setZoom({ scale: DOUBLE_TAP_SCALE, x: -cx * (DOUBLE_TAP_SCALE - 1), y: -cy * (DOUBLE_TAP_SCALE - 1) })
  }

  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    closeOnClick.current = false

    if (pointers.current.size === 2) {
      drag.current = null
      setDragX(0)
      pinch.current = { distance: distance(), zoom: zoomRef.current }
      setGesturing(true)
      return
    }
    if (pointers.current.size > 2) return

    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      velocityX: 0,
      moved: false,
      onImage: (e.target as HTMLElement).tagName === 'IMG',
      zoomX: zoomRef.current.x,
      zoomY: zoomRef.current.y,
    }
    setGesturing(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current) {
      if (pointers.current.size < 2) return
      const start = pinch.current
      const scale = Math.min(Math.max((start.zoom.scale * distance()) / start.distance, 1), MAX_SCALE)
      const ratio = scale / start.zoom.scale
      setZoom({ scale, x: start.zoom.x * ratio, y: start.zoom.y * ratio })
      return
    }

    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > TAP_SLOP) d.moved = true
    const dt = e.timeStamp - d.lastTime
    if (dt > 0) d.velocityX = (e.clientX - d.lastX) / dt
    d.lastX = e.clientX
    d.lastTime = e.timeStamp
    if (!d.moved) return

    if (zoomRef.current.scale > 1) {
      setZoom({ scale: zoomRef.current.scale, x: d.zoomX + dx, y: d.zoomY + dy })
    } else {
      // Past the first or the last photo the row only gives a little.
      const pastEnd = (index === 0 && dx > 0) || (index === last && dx < 0)
      setDragX(pastEnd ? dx / 3 : dx)
    }
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return

    if (pinch.current) {
      if (pointers.current.size > 0) return
      pinch.current = null
      if (zoomRef.current.scale < 1.05) setZoom(NO_ZOOM)
      setGesturing(false)
      return
    }

    const d = drag.current
    drag.current = null
    setGesturing(false)
    if (!d) return

    if (!d.moved) {
      if (e.type === 'pointercancel') return
      const tap = lastTap.current
      const now = e.timeStamp
      if (tap && now - tap.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) {
        lastTap.current = null
        toggleZoom(e.clientX, e.clientY)
        return
      }
      lastTap.current = { time: now, x: e.clientX, y: e.clientY }
      closeOnClick.current = !d.onImage && zoomRef.current.scale === 1
      return
    }

    if (zoomRef.current.scale > 1) return
    const dx = e.clientX - d.startX
    const direction = Math.abs(dx) > SWIPE_DISTANCE
      ? Math.sign(dx)
      : Math.abs(d.velocityX) > SWIPE_VELOCITY ? Math.sign(d.velocityX) : 0
    setDragX(0)
    if (direction !== 0) go(index - direction)
  }

  if (typeof document === 'undefined' || photos.length === 0) return null

  const many = photos.length > 1
  const arrowClass =
    'absolute top-1/2 -translate-y-1/2 z-10 hidden md:flex w-12 h-12 rounded-full bg-surface/20 hover:bg-surface/30 items-center justify-center transition-colors disabled:opacity-30 active:scale-95'

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Φωτογραφίες"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-on-surface select-none outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <span className="text-white/80 text-xs font-bold tracking-widest" aria-live="polite">
          {many ? `${index + 1} / ${photos.length}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-surface/20 hover:bg-surface/30 flex items-center justify-center transition-colors active:scale-95"
          aria-label="Κλείσιμο"
        >
          <Icon name="close" size="md" className="text-white" />
        </button>
      </div>

      <div
        ref={stageRef}
        className={`relative flex-1 min-h-0 overflow-hidden touch-none ${zoom.scale > 1 ? 'cursor-grab' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={() => {
          if (closeOnClick.current) onClose()
          closeOnClick.current = false
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
            transition: gesturing ? 'none' : 'transform 300ms ease-out',
          }}
        >
          {photos.map((photo, i) => (
            <div key={`${i}-${photo.url}`} className="w-full h-full flex-shrink-0 flex items-center justify-center p-4 md:px-20">
              {/* Only this photo and its neighbours load: a request can carry a dozen.
                  A plain <img>: the URLs are presigned and short-lived, so the image
                  optimiser would only add a dead cache entry. */}
              {Math.abs(i - index) <= 1 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={photo.alt}
                  draggable={false}
                  className="max-h-full max-w-full object-contain rounded-xl"
                  style={i === index ? {
                    transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                    transition: gesturing ? 'none' : 'transform 200ms ease-out',
                  } : undefined}
                />
              )}
            </div>
          ))}
        </div>

        {many && (
          <>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); go(index - 1) }}
              disabled={index === 0}
              className={`${arrowClass} left-4`}
              aria-label="Προηγούμενη φωτογραφία"
            >
              <Icon name="chevron_left" size="lg" className="text-white" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); go(index + 1) }}
              disabled={index === last}
              className={`${arrowClass} right-4`}
              aria-label="Επόμενη φωτογραφία"
            >
              <Icon name="chevron_right" size="lg" className="text-white" />
            </button>
          </>
        )}
      </div>

      <div className="flex justify-center gap-1.5 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] min-h-[2.75rem]">
        {many && photos.map((photo, i) => (
          <button
            key={`${i}-${photo.url}`}
            type="button"
            onClick={() => go(i)}
            className="p-1"
            aria-label={`Φωτογραφία ${i + 1}`}
            aria-current={i === index}
          >
            <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary-container' : 'w-1.5 bg-white/40'}`} />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
