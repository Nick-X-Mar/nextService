'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Button from '@/components/Button'
import {
  CONSENT_SETTLED_ATTR,
  OPEN_CONSENT_EVENT,
  clearAnalyticsCookies,
  isMeasuredHost,
  loadAnalytics,
  readConsent,
  storeConsent,
} from '@/lib/analytics'

/**
 * Asks once whether Google Analytics may run, and runs it only on a yes. Saying no
 * is as easy as saying yes, and the footer's «Ρυθμίσεις cookies» reopens the
 * question, because consent has to be as easy to withdraw as to give.
 */
export default function AnalyticsConsent() {
  const pathname = usePathname()
  // Rendered by the server too, so it paints with the page; CONSENT_SETTLED_SCRIPT
  // hides it before the first paint when there is nothing to ask, and the
  // effect below then drops it.
  const [open, setOpen] = useState(true)
  // The server HTML shows the question before the script that answers it has
  // loaded; a tap then would do nothing, so the buttons wait, disabled.
  const [ready, setReady] = useState(false)
  const inAdmin = pathname?.startsWith('/admin')

  useEffect(() => {
    setReady(true)
    if (!isMeasuredHost() || inAdmin) {
      setOpen(false)
      return
    }
    const consent = readConsent()
    if (consent === 'granted') loadAnalytics()
    if (consent !== null) setOpen(false)

    const reopen = () => {
      document.documentElement.removeAttribute(CONSENT_SETTLED_ATTR)
      setOpen(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [inAdmin])

  if (!open || inAdmin) return null

  const accept = () => {
    storeConsent('granted')
    loadAnalytics()
    setOpen(false)
  }

  const decline = () => {
    const withdrawn = readConsent() === 'granted'
    storeConsent('denied')
    clearAnalyticsCookies()
    setOpen(false)
    if (withdrawn) window.location.reload()
  }

  return (
    <div
      data-consent-banner
      role="dialog"
      aria-label="Cookies στατιστικών"
      className="fixed inset-x-0 bottom-16 md:bottom-4 z-[55] px-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-surface-container-lowest p-4 shadow-2xl border border-outline-variant/20">
        <p className="text-sm text-on-surface">
          Θες να μετράμε με το Google Analytics πώς χρησιμοποιείται το site; Χρησιμοποιεί cookies και
          ενεργοποιείται μόνο αν το αποδεχτείς.{' '}
          <Link href="/privacy/" className="font-bold text-primary underline">
            Πολιτική Απορρήτου
          </Link>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={decline} disabled={!ready}>
            Όχι, ευχαριστώ
          </Button>
          <Button variant="outline" size="sm" onClick={accept} disabled={!ready}>
            Αποδοχή
          </Button>
        </div>
      </div>
    </div>
  )
}
