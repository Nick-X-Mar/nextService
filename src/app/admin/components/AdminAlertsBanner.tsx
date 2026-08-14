'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface AdminAlerts {
  pendingGarages: number
  failedPayments: number
  openErrorGroups: number
}

// Slower than the app-side poll: none of these change minute to minute, and the
// server caches for 60s anyway.
const POLL_INTERVAL_MS = 2 * 60 * 1000

/**
 * The admin equivalent of the client-facing alert stack: the handful of counts
 * that mean somebody is waiting on you.
 *
 * Renders nothing when everything is at zero, so a quiet system stays quiet —
 * a banner that is always present stops being read.
 */
export default function AdminAlertsBanner() {
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/admin/alerts/')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.success) setAlerts(data)
      } catch {
        /* silent — non-critical chrome */
      }
    }

    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!alerts) return null

  const items: Array<{ href: string; label: string; count: number; tone: string }> = [
    {
      href: '/admin/garages/?tab=pending',
      label: alerts.pendingGarages === 1 ? 'συνεργείο περιμένει έγκριση' : 'συνεργεία περιμένουν έγκριση',
      count: alerts.pendingGarages,
      tone: 'bg-primary/10 text-primary',
    },
    {
      href: '/admin/payments/',
      label: alerts.failedPayments === 1 ? 'αποτυχημένη πληρωμή' : 'αποτυχημένες πληρωμές',
      count: alerts.failedPayments,
      tone: 'bg-error-container/40 text-error',
    },
    {
      href: '/admin/errors/',
      label: alerts.openErrorGroups === 1 ? 'ανοιχτό σφάλμα' : 'ανοιχτά σφάλματα',
      count: alerts.openErrorGroups,
      tone: 'bg-error-container/40 text-error',
    },
  ].filter((item) => item.count > 0)

  if (items.length === 0) return null

  return (
    <div className="border-b border-outline-variant/20 bg-surface-container-low px-6 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface/50">
          Χρειάζονται προσοχή
        </span>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-2 text-sm text-on-surface/80 hover:text-on-surface transition-colors"
          >
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${item.tone}`}>
              {item.count}
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
