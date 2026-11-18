'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import PushPrompt from '@/components/PushPrompt'
import { isStandalone, registerServiceWorker } from '@/lib/pwa'
import { pushState, syncPush } from '@/lib/web-push-client'
import { isMeasuredHost, readConsent } from '@/lib/analytics'

const PROMPT_DISMISSED_KEY = 'pushPrompt.dismissedAt'
/** «Όχι τώρα» rests the question this long. */
const PROMPT_REST_MS = 2 * 24 * 60 * 60 * 1000

function promptResting(): boolean {
  try {
    const at = Number(localStorage.getItem(PROMPT_DISMISSED_KEY))
    return Number.isFinite(at) && Date.now() - at < PROMPT_REST_MS
  } catch {
    return false
  }
}

/**
 * The site as an installed app (src/app/manifest.ts), mounted once in the
 * root layout:
 *
 * - registers the service worker (public/sw.js) on every page, for the
 *   offline page and push notifications;
 * - once the server has confirmed who is signed in: in the installed app the
 *   session becomes the app's long one (`/api/auth/app-session`), and where
 *   notifications are allowed the account gets this device's subscription;
 * - asks (PushPrompt) whether to turn notifications on: in the installed
 *   app, and for garages in a browser too, since their new requests do not
 *   wait. A client in a browser tab is not asked; email reaches them.
 */
export default function PwaManager() {
  const { isVerified, userType, client, garage } = useAuth()
  const pathname = usePathname()
  const [asking, setAsking] = useState(false)
  const signedInAs = client?.id ?? garage?.id ?? null
  const audience = userType === 'garage' ? 'garage' : 'client'

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return
    const register = () => { void registerServiceWorker() }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  useEffect(() => {
    if (!isVerified || !signedInAs) return
    let live = true
    ;(async () => {
      const standalone = isStandalone()
      if (standalone) await fetch('/api/auth/app-session/', { method: 'POST' }).catch(() => {})
      await syncPush(`${userType}#${signedInAs}`)
      if (!live || (!standalone && audience !== 'garage')) return
      if (promptResting() || (isMeasuredHost() && readConsent() === null)) return
      // Never asked: neither by the browser nor turned off here.
      const state = await pushState()
      if (live && state === 'off' && Notification.permission === 'default') setAsking(true)
    })()
    return () => { live = false }
  }, [isVerified, signedInAs, userType, audience])

  if (!asking || !signedInAs || pathname.startsWith('/admin')) return null

  return (
    <PushPrompt
      audience={audience}
      onDone={(enabled) => {
        if (!enabled) {
          try { localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now())) } catch { /* asked again next time */ }
        }
        setAsking(false)
      }}
    />
  )
}
