'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useNewRequestNotifier } from '@/hooks/useNewRequestNotifier'

/**
 * The garage's bell: how many requests landed since it last looked, from any
 * screen in the app. The count comes off the live AppSync feed in
 * NotificationsContext, so it moves without a reload; opening the panel is what
 * clears it, the same way every notification bell behaves.
 */
export default function NewRequestBell() {
  const { userType, garage } = useAuth()
  const { liveRequests, availableRequests, markRequestsSeen } = useNotifications()
  const { soundEnabled, setSoundEnabled } = useNewRequestNotifier()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (userType !== 'garage' || !garage?.isActive) return null

  const count = liveRequests.length
  const requestsHref = `/garage-dashboard/${garage.id}/?tab=requests`

  const openFeed = () => {
    markRequestsSeen()
    setOpen(false)
    router.push(requestsHref)
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count === 0 ? 'Ειδοποιήσεις' : count === 1 ? '1 νέο αίτημα' : `${count} νέα αιτήματα`}
        className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors active:scale-95"
      >
        <Icon
          name="notifications"
          filled={count > 0}
          className={count > 0 ? 'text-primary animate-[pulse_1.5s_ease-in-out_3]' : 'text-on-surface-variant'}
        />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-tertiary text-white text-[9px] font-black leading-none h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-[0_4px_24px_rgba(27,28,28,0.12)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              Ειδοποιήσεις
            </p>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? 'Απενεργοποίηση ήχου' : 'Ενεργοποίηση ήχου'}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-secondary hover:text-on-surface transition-colors"
            >
              <Icon name={soundEnabled ? 'volume_up' : 'volume_off'} size="sm" />
              {soundEnabled ? 'Ήχος' : 'Σίγαση'}
            </button>
          </div>

          {count === 0 ? (
            <div className="px-4 py-6 text-center">
              <Icon name="notifications_off" className="text-on-surface-variant/40" size="lg" />
              <p className="text-sm font-semibold text-on-surface-variant mt-2">
                Κανένα νέο αίτημα αυτή τη στιγμή
              </p>
              {availableRequests > 0 && (
                <p className="text-xs text-secondary mt-1">
                  {availableRequests} ανοιχτά αιτήματα σε αναμονή προσφοράς
                </p>
              )}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-outline-variant/10">
              {liveRequests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={openFeed}
                    className="w-full text-left px-4 py-3 hover:bg-surface-container transition-colors flex items-start gap-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon name="build" size="sm" className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{r.category}</p>
                      {r.vehicle && (
                        <p className="text-xs text-on-surface-variant truncate">{r.vehicle}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={openFeed}
            className="w-full px-4 py-3 text-xs font-bold uppercase tracking-[0.1em] text-primary hover:bg-primary/5 transition-colors border-t border-outline-variant/10"
          >
            Δες τα αιτήματα
          </button>
        </div>
      )}
    </div>
  )
}
