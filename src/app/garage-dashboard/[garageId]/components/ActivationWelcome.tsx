'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'

interface ActivationWelcomeProps {
  garageId: string
  companyName?: string
  /** ISO timestamp written by the admin activation */
  activatedAt?: string
}

// Approval usually lands in the inbox, not in an open tab — so the "you're in"
// moment has to survive until the next login. We show it once, for a couple of
// weeks after activation, then it stops on its own even if never dismissed.
const WELCOME_WINDOW_DAYS = 14

const dismissKey = (garageId: string, activatedAt: string) =>
  `garageActivationSeen:${garageId}:${activatedAt}`

const steps = [
  { icon: 'list_alt', label: 'Δες τα νέα αιτήματα', tab: 'requests' },
  { icon: 'local_offer', label: 'Στείλε την πρώτη σου προσφορά', tab: 'offers' },
  { icon: 'settings', label: 'Συμπλήρωσε τα στοιχεία του συνεργείου', tab: 'settings' },
]

export default function ActivationWelcome({ garageId, companyName, activatedAt }: ActivationWelcomeProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!activatedAt) return

    const activatedTime = new Date(activatedAt).getTime()
    if (Number.isNaN(activatedTime)) return
    const daysSince = (Date.now() - activatedTime) / 86400000
    if (daysSince > WELCOME_WINDOW_DAYS) return

    try {
      if (localStorage.getItem(dismissKey(garageId, activatedAt))) return
    } catch {
      // Privacy mode — showing it again is better than not showing it at all.
    }
    setVisible(true)
  }, [garageId, activatedAt])

  if (!visible || !activatedAt) return null

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(dismissKey(garageId, activatedAt), new Date().toISOString())
    } catch {
      // ignore quota / privacy mode failures
    }
  }

  return (
    <div className="relative bg-surface-container-lowest rounded-2xl p-6 mb-4 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
      <button
        onClick={dismiss}
        aria-label="Κλείσιμο"
        className="absolute top-4 right-4 text-on-surface-variant/60 hover:text-on-surface transition-colors duration-200 active:scale-95"
      >
        <Icon name="close" size="sm" />
      </button>

      <div className="flex items-start gap-4">
        <div className="hidden sm:flex items-center justify-center h-12 w-12 rounded-full bg-green-50 shrink-0">
          <Icon name="verified" filled className="text-green-600" size="lg" />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`${styles.labelUpper} mb-1`}>Λογαριασμός ενεργός</p>
          <h2 className="text-xl font-black tracking-tight text-on-surface mb-2">
            {companyName ? `${companyName}, είσαι μέσα!` : 'Είσαι μέσα!'}
          </h2>
          <p className={`${styles.bodyText} mb-4`}>
            Ο λογαριασμός σου εγκρίθηκε. Από εδώ και πέρα βλέπεις τα αιτήματα των πελατών στην περιοχή σου και στέλνεις προσφορές.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            {steps.map((step) => (
              <Link
                key={step.tab}
                href={`/garage-dashboard/${garageId}/?tab=${step.tab}`}
                className="flex items-center gap-2 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors duration-200 active:scale-95"
              >
                <Icon name={step.icon} size="sm" className="text-primary shrink-0" />
                <span className="text-xs font-bold text-on-surface">{step.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
