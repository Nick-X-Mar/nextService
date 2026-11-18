'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/Button'
import Icon from '@/components/ui/Icon'
import { useNavigation } from '@/hooks/useNavigation'
import { installRoute, promptInstall, watchInstall, type InstallRoute } from '@/lib/pwa'

const DISMISSED_KEY = 'installNudge.dismissedAt'
/** «Όχι τώρα» rests the card this long. */
const REST_MS = 2 * 24 * 60 * 60 * 1000

function resting(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY))
    return Number.isFinite(at) && Date.now() - at < REST_MS
  } catch {
    return false
  }
}

/**
 * On a client's requests, where sending a request lands them: the moment the
 * offers are what they wait for, so the moment to offer the app (src/app/
 * manifest.ts) that tells them as they arrive. One tap where the browser
 * offers the install, the /app/ page's steps everywhere else. Not shown
 * inside the app, nor where it cannot be installed.
 */
export default function InstallAppNudge() {
  const [route, setRoute] = useState<InstallRoute | null>(null)
  const [hidden, setHidden] = useState(true)
  const { navigate, isNavigating } = useNavigation()

  useEffect(() => {
    const update = () => setRoute(installRoute())
    update()
    setHidden(resting())
    return watchInstall(update)
  }, [])

  if (hidden || !route || route === 'installed' || route === 'other-browser') return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* shown again next time */ }
    setHidden(true)
  }

  const install = async () => {
    if (route !== 'prompt') return navigate('/app/')
    if ((await promptInstall()) === 'accepted') setHidden(true)
    else setRoute(installRoute())
  }

  return (
    <div
      role="region"
      aria-label="Η εφαρμογή NextService"
      className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <Icon name="install_mobile" size="md" className="text-primary flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface">Μάθε αμέσως για τις προσφορές</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Βάλε το NextService στην οθόνη σου: σε ειδοποιούμε μόλις έρθει προσφορά ή μήνυμα, και ανοίγει με ένα πάτημα.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={dismiss}>
          Όχι τώρα
        </Button>
        <Button variant="primary" size="sm" onClick={install} loading={isNavigating('/app/')}>
          {route === 'prompt' ? 'Εγκατάσταση' : 'Δες πώς'}
        </Button>
      </div>
    </div>
  )
}
