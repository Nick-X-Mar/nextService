'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Button from '@/components/Button'
import {
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
  const [open, setOpen] = useState(false)
  const inAdmin = pathname?.startsWith('/admin')

  useEffect(() => {
    if (!isMeasuredHost() || inAdmin) return
    const consent = readConsent()
    if (consent === 'granted') loadAnalytics()
    if (consent === null) setOpen(true)

    const reopen = () => setOpen(true)
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
      role="dialog"
      aria-label="Cookies στατιστικών"
      className="fixed inset-x-0 bottom-20 md:bottom-4 z-[55] px-4 pointer-events-none"
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
          <Button variant="outline" size="sm" onClick={decline}>
            Όχι, ευχαριστώ
          </Button>
          <Button variant="outline" size="sm" onClick={accept}>
            Αποδοχή
          </Button>
        </div>
      </div>
    </div>
  )
}
