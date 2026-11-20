'use client'

import Button from '@/components/Button'
import { enablePush } from '@/lib/web-push-client'
import { useToast } from '@/hooks/useToast'

const COPY = {
  garage: 'Να σας ειδοποιούμε σε αυτή τη συσκευή για νέα αιτήματα, ραντεβού και μηνύματα, ακόμα κι όταν το NextService είναι κλειστό;',
  client: 'Θες να σε ειδοποιούμε εδώ για νέες προσφορές και μηνύματα από τα συνεργεία, ακόμα κι όταν το NextService είναι κλειστό;',
} as const

/**
 * The one question before the browser's own: whether to turn notifications
 * on. Asked by PwaManager, once in a while, of someone signed in who has
 * never answered the browser's. «Όχι τώρα» leaves the browser's question
 * unasked, so it can still be asked later (a «Block» there is for good).
 * Sits where the cookie question does, which it never shares the screen with.
 */
export default function PushPrompt({ audience, onDone }: { audience: 'garage' | 'client'; onDone: (enabled: boolean) => void }) {
  const { error } = useToast()

  const enable = async () => {
    const state = await enablePush()
    if (state === 'off' && Notification.permission === 'granted') {
      error('Δεν ενεργοποιήθηκαν οι ειδοποιήσεις', 'Ενεργοποιούνται και αργότερα, από τις ρυθμίσεις.')
    }
    onDone(state === 'on')
  }

  return (
    <div
      role="dialog"
      aria-label="Ειδοποιήσεις"
      className="fixed inset-x-0 bottom-16 md:bottom-4 z-[55] px-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-surface-container-lowest p-4 shadow-2xl border border-outline-variant/20">
        <p className="text-sm text-on-surface">{COPY[audience]}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onDone(false)}>
            Όχι τώρα
          </Button>
          <Button variant="primary" size="sm" onClick={enable}>
            Ενεργοποίηση
          </Button>
        </div>
      </div>
    </div>
  )
}
