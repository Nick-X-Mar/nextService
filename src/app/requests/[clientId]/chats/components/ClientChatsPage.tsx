'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import { ServiceRequestStatus } from '@/types/statuses'
import { getCategoryText } from '@/utils/categoryLabels'

/** One row of `GET /api/chat/client-threads` — see `clientThreads` on the server. */
interface ClientThreadView {
  requestId: string
  garageId: string
  garageName: string
  garageLogoUrl: string | null
  status: string
  bucket: 'open' | 'appointment' | 'history'
  unread: number
  lastMessage: { message: string; timestamp: string; senderType: 'client' | 'garage' } | null
  category: string | null
  vehicle: { brand?: string; model?: string; modelYear?: string } | null
  appointmentDate: string | null
}

interface ClientChatsPageProps {
  clientId: string
}

type TabType = 'open' | 'appointment' | 'history'

const TABS: { key: TabType; label: string; empty: [string, string] }[] = [
  {
    key: 'open',
    label: 'Ανοιχτά',
    empty: [
      'Δεν υπάρχουν ανοιχτές συνομιλίες',
      'Όταν ένα συνεργείο σάς γράψει για ένα αίτημα, η συνομιλία θα εμφανιστεί εδώ.',
    ],
  },
  {
    key: 'appointment',
    label: 'Ραντεβού',
    empty: [
      'Δεν υπάρχουν ραντεβού',
      'Όταν αποδεχτείτε μια προσφορά, η συνομιλία με το συνεργείο θα εμφανιστεί εδώ.',
    ],
  },
  {
    key: 'history',
    label: 'Ιστορικό',
    empty: [
      'Δεν υπάρχει ιστορικό',
      'Εδώ μένουν, μόνο για ανάγνωση, οι συνομιλίες με συνεργεία που δεν ανέλαβαν την εργασία και όσες αφορούν ακυρωμένα αιτήματα.',
    ],
  },
]

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

function initials(name: string) {
  return name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase().slice(0, 2)
}

function StatusChip({ thread }: { thread: ClientThreadView }) {
  if (thread.bucket === 'history') {
    return thread.status === ServiceRequestStatus.CANCELLED
      ? <span className={styles.statusCancelled}>Ακυρώθηκε</span>
      : <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-secondary bg-surface-container px-2 py-1 rounded-sm">Μόνο ανάγνωση</span>
  }
  switch (thread.status) {
    case ServiceRequestStatus.PENDING:
      return <span className={styles.statusPending}>Ενεργό</span>
    case ServiceRequestStatus.APPOINTMENT:
      return <span className={styles.statusAppointment}>Ραντεβού</span>
    case ServiceRequestStatus.COMPLETED:
      return <span className={styles.statusCompleted}>Ολοκληρώθηκε</span>
    default:
      return null
  }
}

/**
 * The client's conversations, one row per garage per request.
 *
 * Rendered from the endpoint the Μηνύματα badge is counted by, so every
 * conversation behind the badge is a row here and opening it clears it.
 */
export default function ClientChatsPage({ clientId }: ClientChatsPageProps) {
  const { navigate, isNavigating } = useNavigation()
  const { error } = useToast()
  const [threads, setThreads] = useState<Record<TabType, ClientThreadView[]>>({
    open: [],
    appointment: [],
    history: [],
  })
  const [activeTab, setActiveTab] = useState<TabType>('open')
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/chat/client-threads/', { cache: 'no-store' })
        if (!res.ok) throw new Error(`client-threads ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        const loaded = {
          open: (data.open ?? []) as ClientThreadView[],
          appointment: (data.appointments ?? []) as ClientThreadView[],
          history: (data.history ?? []) as ClientThreadView[],
        }
        setThreads(loaded)
        // Land on whichever list holds something new.
        if (!loaded.open.some((t) => t.unread > 0) && loaded.appointment.some((t) => t.unread > 0)) {
          setActiveTab('appointment')
        }
      } catch (err) {
        console.error('Error loading conversations:', err)
        if (!cancelled) error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των συνομιλιών')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clientId, error])

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('el')
    if (!q) return threads[activeTab]
    return threads[activeTab].filter((t) =>
      [
        t.garageName,
        t.vehicle?.brand,
        t.vehicle?.model,
        getCategoryText(t.category ?? ''),
        t.lastMessage?.message,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('el').includes(q))
    )
  }, [threads, activeTab, searchQuery])

  const chatHref = (t: ClientThreadView) =>
    `/requests/${clientId}/chats/${t.requestId}/?garageId=${t.garageId}`

  const requestsHref = `/requests/${clientId}/`

  if (isLoading) {
    return (
      <section className="bg-surface">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-4">
          <div className="text-center py-20">
            <div className={styles.loadingSpinner}></div>
            <p className="text-sm text-on-surface-variant">Φόρτωση συνομιλιών...</p>
          </div>
        </div>
      </section>
    )
  }

  const tab = TABS.find((t) => t.key === activeTab)!

  return (
    <section className="bg-surface">
      <div className="max-w-2xl mx-auto px-4 pt-2 pb-4">
        <h1 className="text-2xl font-bold text-on-surface mb-6">Μηνύματα</h1>

        <div className="mb-5">
          <div className="relative">
            <Icon name="search" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Αναζήτηση συνομιλιών..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 bg-surface-container-highest border-0 rounded-full pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar" role="tablist">
          {TABS.map(({ key, label }) => {
            const unread = threads[key].filter((t) => t.unread > 0).length
            const selected = activeTab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap ${
                  selected ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                {label}
                {unread > 0 && (
                  <span
                    className={`text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center ${
                      selected ? 'bg-on-primary text-primary' : 'bg-primary text-on-primary'
                    }`}
                    aria-label={`${unread} με νέα μηνύματα`}
                  >
                    {unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {visible.length > 0 ? (
          <div className="space-y-3">
            {visible.map((thread) => {
              const href = chatHref(thread)
              const opening = isNavigating(href)
              const hasUnread = thread.unread > 0
              const readOnly = thread.bucket === 'history'
              const vehicleName = thread.vehicle
                ? [thread.vehicle.brand, thread.vehicle.model].filter(Boolean).join(' ')
                : ''
              return (
                <div
                  key={`${thread.requestId}-${thread.garageId}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(href)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(href) }}
                  data-request-id={thread.requestId}
                  data-garage-id={thread.garageId}
                  className={`${
                    readOnly
                      ? 'bg-surface-container-low border-l-4 border-transparent opacity-80'
                      : 'bg-surface-container-lowest border-l-4 border-primary shadow-[0_4px_24px_rgba(27,28,28,0.02)]'
                  } p-5 rounded-xl transition-all duration-200 cursor-pointer hover:shadow-md active:scale-[0.99]`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {opening ? (
                        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
                          <Spinner size="md" className="text-primary" />
                        </div>
                      ) : thread.garageLogoUrl ? (
                        <Image
                          src={thread.garageLogoUrl}
                          alt={thread.garageName}
                          width={48}
                          height={48}
                          className={`w-12 h-12 rounded-full object-cover ${readOnly ? 'grayscale' : ''}`}
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center ${readOnly ? 'grayscale' : ''}`}>
                          <span className="text-on-primary font-bold text-xs">{initials(thread.garageName)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="font-bold text-base text-on-surface truncate">{thread.garageName}</h3>
                        <StatusChip thread={thread} />
                      </div>

                      <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-2 truncate">
                        {[vehicleName, thread.vehicle?.modelYear].filter(Boolean).join(' ')}
                        {vehicleName ? ' · ' : ''}
                        {getCategoryText(thread.category ?? '')}
                      </p>

                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate min-w-0 ${hasUnread ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                          {thread.lastMessage?.senderType === 'client' ? 'Εσείς: ' : ''}
                          {thread.lastMessage?.message}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {hasUnread && (
                            <div className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
                              {thread.unread}
                            </div>
                          )}
                          {thread.lastMessage && (
                            <span className="text-xs text-on-surface-variant">
                              {formatLastMessageTime(thread.lastMessage.timestamp)}
                            </span>
                          )}
                        </div>
                      </div>

                      {thread.status === ServiceRequestStatus.APPOINTMENT && thread.appointmentDate && !readOnly && (
                        <div className="mt-2 flex items-center gap-1.5 bg-surface-container rounded-lg px-2.5 py-1.5 w-fit">
                          <Icon name="calendar_month" size="sm" className="text-primary" />
                          <span className="text-[11px] font-bold text-on-surface">
                            {formatAppointmentDate(thread.appointmentDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="mx-auto w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-5">
              <Icon name="chat_bubble_outline" size="xl" className="text-on-surface-variant" />
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">
              {searchQuery.trim() ? 'Δεν βρέθηκαν συνομιλίες' : tab.empty[0]}
            </h3>
            <p className="text-sm text-on-surface-variant mb-8 max-w-sm mx-auto">
              {searchQuery.trim() ? 'Δοκιμάστε άλλη αναζήτηση.' : tab.empty[1]}
            </p>
            <button
              onClick={() => navigate(requestsHref)}
              disabled={isNavigating(requestsHref)}
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-medium text-sm hover:opacity-90 transition-opacity mx-auto disabled:opacity-70 active:scale-95"
            >
              {isNavigating(requestsHref) ? <Spinner size="sm" /> : <Icon name="list_alt" size="sm" />}
              Δείτε τα Αιτήματά σας
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
