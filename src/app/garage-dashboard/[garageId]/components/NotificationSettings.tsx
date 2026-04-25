'use client'

import Icon from '@/components/ui/Icon'
import Switch from '@/components/Switch'
import { useNewRequestNotifier } from '@/hooks/useNewRequestNotifier'

// Card-style settings panel for the realtime new-request notifier. The hook
// owns all the persistence; this component just renders the toggles and any
// permission warnings.
export default function NotificationSettings() {
  const {
    soundEnabled,
    setSoundEnabled,
    browserNotifEnabled,
    setBrowserNotifEnabled,
    browserNotifSupported,
    browserNotifPermission,
  } = useNewRequestNotifier()

  return (
    <article className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-surface-container text-primary">
          <Icon name="notifications_active" filled size="md" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-on-surface">Ειδοποιησεις Νεων Αιτηματων</h3>
          <p className="text-xs text-secondary">Πως θελετε να ενημερωνεστε οταν φτανει νεο αιτημα</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="volume_up" filled size="sm" className="text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface">Ηχητικη ειδοποιηση</p>
              <p className="text-xs text-secondary truncate">Συντομος ηχος μολις φτασει νεο αιτημα</p>
            </div>
          </div>
          <Switch checked={soundEnabled} onChange={setSoundEnabled} size="md" />
        </div>

        <div className="flex items-center justify-between gap-4 p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="desktop_windows" filled size="sm" className="text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface">Ειδοποιηση συστηματος</p>
              <p className="text-xs text-secondary truncate">
                {browserNotifSupported
                  ? 'Native ειδοποιηση οταν το παραθυρο δεν ειναι ενεργο'
                  : 'Ο browser σας δεν υποστηριζει native ειδοποιησεις'}
              </p>
            </div>
          </div>
          <Switch
            checked={browserNotifEnabled && browserNotifPermission === 'granted'}
            onChange={(value) => { void setBrowserNotifEnabled(value) }}
            size="md"
            disabled={!browserNotifSupported || browserNotifPermission === 'denied'}
          />
        </div>

        {browserNotifSupported && browserNotifPermission === 'denied' && (
          <p className="text-xs text-error px-3">
            Εχετε αρνηθει τις ειδοποιησεις στον browser. Αλλαξτε το απο τις ρυθμισεις του browser για να τις ενεργοποιησετε.
          </p>
        )}
      </div>
    </article>
  )
}
