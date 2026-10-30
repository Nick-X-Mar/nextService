'use client'

import { useCallback, useEffect, useState } from 'react'
import { styles } from '@/styles/styles'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useToast } from '@/hooks/useToast'
import { useNavigation } from '@/hooks/useNavigation'
import { getCategoryText } from '@/utils/categoryLabels'
import { athensDaysUntil } from '@/utils/athensTime'
import { ServiceRequestStatus } from '@/types/statuses'
import { isGarageInactive } from '../../components/garageInactive'

/** One row of `GET /api/chat/garage-chats` — see `garageThreads` on the server. */
export interface GarageThreadView {
  requestId: string
  status: string
  bucket: 'open' | 'appointment'
  unread: number
  lastMessage: { message: string; timestamp: string; senderType: 'client' | 'garage' } | null
  category: string | null
  vehicle: { brand?: string; model?: string; modelYear?: string } | null
  appointmentDate: string | null
  appointmentTime: string | null
  completedAt: string | null
  needsReview?: boolean
}

/**
 * Both of the garage's chat lists, from the endpoint the unread badge is
 * computed by. Each page shows one bucket and links to the other, so whatever
 * the badge counts is always reachable from either.
 */
export function useGarageThreads() {
  const { error } = useToast()
  const [open, setOpen] = useState<GarageThreadView[]>([])
  const [appointments, setAppointments] = useState<GarageThreadView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // The server's word that this garage is not approved (or no longer is):
  // the pages show the pending screen instead of an error toast.
  const [inactive, setInactive] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/garage-chats/', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (isGarageInactive(res, data)) {
        setInactive(true)
        return
      }
      if (!res.ok || !data) throw new Error(`garage-chats ${res.status}`)
      setInactive(false)
      setOpen(data.open ?? [])
      setAppointments(data.appointments ?? [])
    } catch (err) {
      console.error('Error loading garage chats:', err)
      error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των συνομιλιών')
    } finally {
      setIsLoading(false)
    }
  }, [error])

  useEffect(() => { load() }, [load])

  return { open, appointments, isLoading, inactive, reload: load }
}

const unreadIn = (threads: GarageThreadView[]) => threads.filter((t) => t.unread > 0).length

/** The switch between the two lists, with how many conversations in each wait on the garage. */
export function GarageChatTabs({
  garageId,
  active,
  open,
  appointments,
}: {
  garageId: string
  active: 'open' | 'appointment'
  open: GarageThreadView[]
  appointments: GarageThreadView[]
}) {
  const { navigate, isNavigating } = useNavigation()
  const tabs = [
    { key: 'open' as const, label: 'Ανοιχτές', href: `/garage-dashboard/${garageId}/chats/`, unread: unreadIn(open) },
    { key: 'appointment' as const, label: 'Ραντεβού', href: `/garage-dashboard/${garageId}/chats/appointments/`, unread: unreadIn(appointments) },
  ]

  return (
    <div className="flex items-center gap-2 pb-4" role="tablist">
      {tabs.map((tab) => {
        const selected = tab.key === active
        const busy = isNavigating(tab.href)
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => { if (!selected) navigate(tab.href) }}
            disabled={busy}
            className={`${selected ? styles.chipActive : styles.chip} flex items-center gap-2 active:scale-95 disabled:opacity-70`}
          >
            {busy && <Spinner size="sm" />}
            {tab.label}
            {tab.unread > 0 && (
              <span
                className={`text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center ${
                  selected ? 'bg-on-primary text-primary' : 'bg-primary text-on-primary'
                }`}
                aria-label={`${tab.unread} με νέα μηνύματα`}
              >
                {tab.unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function formatLastMessageTime(timestamp: string) {
  const date = new Date(timestamp)
  const diffInHours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
  return diffInHours < 24
    ? date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })
}

/** 'YYYY-MM-DD' as an Athens calendar date, whatever zone the browser is in. */
function formatAppointmentDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('el-GR', {
    timeZone: 'Europe/Athens',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'long',
  })
}

function appointmentWhen(date: string): string {
  const days = athensDaysUntil(date)
  if (days === null) return ''
  if (days < 0) return 'Εκκρεμεί η ολοκλήρωση'
  if (days === 0) return 'Σήμερα'
  if (days === 1) return 'Αύριο'
  return `Σε ${days} ημέρες`
}

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case ServiceRequestStatus.PENDING:
      return <span className={styles.statusPending}>Εκκρεμές</span>
    case ServiceRequestStatus.APPOINTMENT:
      return <span className={styles.statusAppointment}>Ραντεβού</span>
    case ServiceRequestStatus.COMPLETED:
      return <span className={styles.statusCompleted}>Ολοκληρώθηκε</span>
    case ServiceRequestStatus.IN_PROGRESS:
      return <span className={styles.statusInProgress}>Σε εξέλιξη</span>
    default:
      return null
  }
}

export function GarageThreadCard({ garageId, thread }: { garageId: string; thread: GarageThreadView }) {
  const { navigate, isNavigating } = useNavigation()
  const href = `/garage-dashboard/${garageId}/chat/${thread.requestId}/`
  const opening = isNavigating(href)
  const { vehicle, lastMessage } = thread
  const showDate = thread.status === ServiceRequestStatus.APPOINTMENT && thread.appointmentDate

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(href)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(href) }}
      className={`${styles.card} cursor-pointer hover:shadow-lg hover:border-primary/20 active:scale-[0.99] transition-all duration-200`}
      data-request-id={thread.requestId}
    >
      {showDate && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/10">
          <div className="w-9 h-9 rounded-lg machined-gradient flex items-center justify-center flex-shrink-0">
            <Icon name="event" size="sm" className="text-on-primary" filled />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              {appointmentWhen(thread.appointmentDate!)}
            </p>
            <p className="text-sm font-bold text-on-surface">
              {formatAppointmentDate(thread.appointmentDate!)}
              {thread.appointmentTime ? ` · ${thread.appointmentTime}` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
          {opening
            ? <Spinner size="sm" className="text-primary" />
            : <Icon name="directions_car" size="sm" className="text-primary" filled />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-on-surface truncate min-w-0">
              {vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') : 'Αίτημα'}
              {vehicle?.modelYear ? ` (${vehicle.modelYear})` : ''}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lastMessage && (
                <span className="text-[10px] text-secondary">{formatLastMessageTime(lastMessage.timestamp)}</span>
              )}
              {thread.unread > 0 && (
                <span className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
                  {thread.unread}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs text-secondary">{getCategoryText(thread.category ?? '')}</span>
            <span className="text-outline">·</span>
            <StatusChip status={thread.status} />
            {thread.needsReview && (
              <span className={styles.statusPending}>Αξιολόγησε τον πελάτη</span>
            )}
          </div>

          {lastMessage ? (
            <p className="text-xs text-secondary line-clamp-1">
              <span className="font-bold text-on-surface-variant">
                {lastMessage.senderType === 'garage' ? 'Εσείς: ' : ''}
              </span>
              {lastMessage.message}
            </p>
          ) : (
            <p className="text-xs text-secondary italic">Δεν υπάρχουν μηνύματα</p>
          )}
        </div>

        <Icon name="chevron_right" size="sm" className="text-outline flex-shrink-0 mt-3" />
      </div>
    </div>
  )
}

/** The page frame both lists share: header with a way back to the dashboard. */
export function GarageChatsHeader({
  garageId,
  title,
  subtitle,
  count,
}: {
  garageId: string
  title: string
  subtitle: string
  count: number
}) {
  const { navigate, isNavigating } = useNavigation()
  const dashboard = `/garage-dashboard/${garageId}/`
  return (
    <div className="bg-surface-container-lowest border-b border-outline-variant/10 sticky top-16 z-20">
      <div className="max-w-3xl mx-auto px-5 md:px-8">
        <div className="flex items-center gap-4 py-4">
          <button
            onClick={() => navigate(dashboard)}
            disabled={isNavigating(dashboard)}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-highest transition-colors disabled:opacity-60"
          >
            {isNavigating(dashboard)
              ? <Spinner size="sm" className="text-on-surface" />
              : <Icon name="arrow_back" size="sm" className="text-on-surface" />}
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-on-surface">{title}</h1>
            <p className="text-xs text-secondary">{subtitle}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center">
            <span className="text-xs font-bold text-on-surface">{count}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
