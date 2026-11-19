'use client'

import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import Switch from '@/components/Switch'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useToast } from '@/hooks/useToast'

// A garage's screens address it formally, a client's informally.
const COPY = {
  garage: {
    detail: 'Νέα αιτήματα, ραντεβού και μηνύματα, ακόμα κι όταν η εφαρμογή είναι κλειστή',
    needsInstall: 'Στο iPhone οι ειδοποιήσεις έρχονται μόνο στην εφαρμογή NextService.',
    install: 'Δείτε πώς μπαίνει στην οθόνη σας',
    denied: 'Τις έχετε μπλοκάρει σε αυτόν τον browser. Επιτρέψτε τις από τις ρυθμίσεις του για να τις ενεργοποιήσετε.',
    unsupported: 'Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις. Ανοίξτε το NextService σε Chrome, Edge ή Safari.',
    failed: 'Δοκιμάστε ξανά σε λίγο.',
  },
  client: {
    detail: 'Νέες προσφορές και μηνύματα από τα συνεργεία, ακόμα κι όταν η εφαρμογή είναι κλειστή',
    needsInstall: 'Στο iPhone οι ειδοποιήσεις έρχονται μόνο στην εφαρμογή NextService.',
    install: 'Δες πώς μπαίνει στην οθόνη σου',
    denied: 'Τις έχεις μπλοκάρει σε αυτόν τον browser. Επίτρεψέ τις από τις ρυθμίσεις του για να τις ενεργοποιήσεις.',
    unsupported: 'Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις. Άνοιξε το NextService σε Chrome, Edge ή Safari.',
    failed: 'Δοκίμασε ξανά σε λίγο.',
  },
} as const

/**
 * The switch for this browser's push notifications (src/lib/web-push-client.ts),
 * with what to do when it cannot be on: install the app (iPhone), unblock
 * them in the browser, or use another browser.
 */
export default function PushNotificationsSetting({ audience }: { audience: 'garage' | 'client' }) {
  const { state, enable, disable, busy } = usePushNotifications()
  const { error } = useToast()
  const copy = COPY[audience]

  const toggle = async (on: boolean) => {
    if (!on) return void disable()
    const next = await enable()
    // Allowed, yet not subscribed: the browser or our server failed, not the person.
    if (next === 'off' && Notification.permission === 'granted') {
      error('Δεν ενεργοποιήθηκαν οι ειδοποιήσεις', copy.failed)
    }
  }

  const note = state === 'needs-install' ? copy.needsInstall
    : state === 'denied' ? copy.denied
      : state === 'unsupported' ? copy.unsupported
        : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 p-3 bg-surface-container-low rounded-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Icon name="notifications_active" filled size="sm" className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p id="push-notifications-label" className="text-sm font-bold text-on-surface">Ειδοποιήσεις σε αυτή τη συσκευή</p>
            <p className="text-xs text-secondary">{copy.detail}</p>
          </div>
        </div>
        {state === null || busy ? (
          <Spinner size="sm" className="text-primary flex-shrink-0" />
        ) : (
          <Switch
            id="push-notifications"
            checked={state === 'on'}
            onChange={(on) => { void toggle(on) }}
            disabled={state !== 'on' && state !== 'off'}
            size="md"
          />
        )}
      </div>

      {note && (
        <p className={`text-xs px-3 ${state === 'denied' ? 'text-error' : 'text-secondary'}`}>
          {note}
          {state === 'needs-install' && (
            <>
              {' '}
              <Link href="/app/" className="text-primary hover:text-primary-container font-bold">
                {copy.install}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  )
}
