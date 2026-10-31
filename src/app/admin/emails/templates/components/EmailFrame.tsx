'use client'

import { useRef, useState } from 'react'

/**
 * A rendered email, isolated from the admin page's styles. `allow-same-origin`
 * without `allow-scripts` lets us measure its height and nothing else: the
 * HTML carries no script, and none could run in here.
 */
export default function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(480)

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={() => {
        const doc = ref.current?.contentDocument
        // + the frame's own border, which comes out of its height.
        if (doc) setHeight(doc.documentElement.scrollHeight + 4)
      }}
      style={{ height }}
      className="w-full rounded-lg border border-outline-variant/20 bg-surface"
    />
  )
}
