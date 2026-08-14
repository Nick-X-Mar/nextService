'use client'

import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useNavigation } from '@/hooks/useNavigation'
import type { Alert } from '@/types/alerts'

interface AlertStackProps {
  /** Show at most this many; the rest wait until these are dealt with. */
  max?: number
  className?: string
}

// Severity is the only thing that changes the look. `urgent` is reserved for
// things with a deadline — a deposit that gates a booking, a same-day
// appointment — so it keeps its weight instead of becoming the default.
const TONE: Record<Alert['severity'], { wrap: string; badge: string; button: string }> = {
  info: {
    wrap: 'bg-surface-container-low border-outline-variant/30',
    badge: 'bg-surface-container-high text-on-surface-variant',
    button: 'bg-surface-variant text-on-surface-variant hover:bg-surface-container-high',
  },
  action: {
    wrap: 'bg-primary/5 border-primary/20',
    badge: 'bg-primary/10 text-primary',
    button: 'bg-primary text-on-primary',
  },
  urgent: {
    wrap: 'bg-error-container/25 border-error/25',
    badge: 'bg-error-container/50 text-error',
    button: 'bg-error text-on-error',
  },
}

/**
 * The standing notices for whoever is signed in — unread messages, new offers,
 * a booking that needs paying, an appointment tomorrow.
 *
 * Renders nothing when there is nothing pending, so pages can drop it in
 * unconditionally. Content comes from `NotificationsContext`, so this shares the
 * app shell's single poll and clears itself once the underlying thing is dealt
 * with, rather than needing to be dismissed.
 */
export default function AlertStack({ max = 3, className = '' }: AlertStackProps) {
  const { alerts } = useNotifications()
  const { navigate, isNavigating } = useNavigation()

  if (alerts.length === 0) return null

  const shown = alerts.slice(0, max)
  const hidden = alerts.length - shown.length

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {shown.map((alert) => {
        const tone = TONE[alert.severity]
        const busy = isNavigating(alert.href)
        return (
          <div
            key={alert.id}
            className={`border rounded-xl p-4 flex items-start gap-3 ${tone.wrap}`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tone.badge}`}
            >
              <Icon name={alert.icon} filled size="md" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-on-surface">{alert.title}</p>
              {alert.detail && (
                <p className="text-xs text-on-surface-variant mt-0.5 truncate">{alert.detail}</p>
              )}
            </div>

            <button
              onClick={() => navigate(alert.href)}
              disabled={busy}
              className={`flex-shrink-0 self-center inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95 disabled:opacity-70 ${tone.button}`}
            >
              {busy ? <Spinner size="sm" /> : <Icon name="arrow_forward" size="sm" />}
              {alert.cta}
            </button>
          </div>
        )
      })}

      {hidden > 0 && (
        <p className="text-xs text-on-surface-variant px-1">
          +{hidden} ακόμη {hidden === 1 ? 'ειδοποίηση' : 'ειδοποιήσεις'}
        </p>
      )}
    </div>
  )
}
