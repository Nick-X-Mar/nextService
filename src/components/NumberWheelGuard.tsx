'use client'

import { useEffect } from 'react'

/**
 * A focused number field changes its value when the mouse wheel or trackpad
 * scrolls over it, so a garage scrolling down the offer page after typing its
 * price quietly sent a different one. Every amount field in the app is a
 * number field; this takes the focus off whichever one the wheel lands on,
 * which leaves its value alone and lets the page scroll as usual. The spinner
 * arrows are hidden in globals.css for the same reason.
 */
export default function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const field = document.activeElement
      if (field instanceof HTMLInputElement && field.type === 'number' && field === e.target) {
        field.blur()
      }
    }
    document.addEventListener('wheel', onWheel, { passive: true })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])
  return null
}
