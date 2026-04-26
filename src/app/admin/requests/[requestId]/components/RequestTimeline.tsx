'use client'

import { useEffect, useState } from 'react'

interface TimelineEvent {
  eventId: string
  timestamp: string
  eventName: string
  actorType: string
  actorId?: string
  actorName?: string
  source?: string
  metadata?: Record<string, unknown>
}

interface RequestTimelineProps {
  requestId: string
}

// Visual mapping of event names to a Material Symbols icon + a brand colour.
// Anything not in the map falls back to a neutral history dot.
const EVENT_VIZ: Record<string, { icon: string; color: string; label?: string }> = {
  service_request_submitted:           { icon: 'add_task',           color: 'text-blue-600',   label: 'Αίτημα δημιουργήθηκε' },
  damage_photos_uploaded:              { icon: 'photo_library',      color: 'text-blue-500',   label: 'Φωτογραφίες ανέβηκαν' },
  client_availability_dates_submitted: { icon: 'event_available',    color: 'text-blue-500',   label: 'Διαθεσιμότητα πελάτη' },
  garage_viewed_available_requests:    { icon: 'visibility',         color: 'text-violet-500', label: 'Συνεργείο είδε αιτήματα' },
  garage_viewed_request_details:       { icon: 'visibility',         color: 'text-violet-500', label: 'Συνεργείο άνοιξε αίτημα' },
  garage_viewed_client_contact:        { icon: 'phone',              color: 'text-violet-700', label: 'Συνεργείο είδε επαφή πελάτη' },
  client_viewed_garage_profile:        { icon: 'storefront',         color: 'text-blue-500',   label: 'Πελάτης είδε προφίλ' },
  chat_message_sent:                   { icon: 'chat',               color: 'text-cyan-600',   label: 'Μήνυμα στο chat' },
  offer_created:                       { icon: 'local_offer',        color: 'text-orange-600', label: 'Προσφορά δημιουργήθηκε' },
  offer_updated:                       { icon: 'edit',               color: 'text-orange-500', label: 'Προσφορά ενημερώθηκε' },
  offer_client_availability_proposed:  { icon: 'event',              color: 'text-orange-500', label: 'Προτάθηκαν ημερομηνίες' },
  offer_accepted:                      { icon: 'check_circle',       color: 'text-emerald-600',label: 'Προσφορά αποδεκτή' },
  offer_rejected:                      { icon: 'cancel',             color: 'text-red-500',    label: 'Προσφορά απορρίφθηκε' },
  appointment_scheduled:               { icon: 'event_available',    color: 'text-cyan-700',   label: 'Ραντεβού προγραμματίστηκε' },
  appointment_cancelled:               { icon: 'event_busy',         color: 'text-red-600',    label: 'Ραντεβού ακυρώθηκε' },
  service_completed:                   { icon: 'task_alt',           color: 'text-emerald-700',label: 'Υπηρεσία ολοκληρώθηκε' },
  service_cancelled:                   { icon: 'block',              color: 'text-red-700',    label: 'Υπηρεσία ακυρώθηκε' },
  payment_initiated:                   { icon: 'payments',           color: 'text-amber-600',  label: 'Πληρωμή ξεκίνησε' },
  payment_succeeded:                   { icon: 'paid',               color: 'text-emerald-600',label: 'Πληρωμή επιτυχής' },
  payment_failed:                      { icon: 'error',              color: 'text-red-600',    label: 'Πληρωμή απέτυχε' },
  payment_abandoned:                   { icon: 'history_toggle_off', color: 'text-amber-700',  label: 'Πληρωμή εγκαταλείφθηκε' },
  wallet_credited:                     { icon: 'account_balance_wallet', color: 'text-emerald-600', label: 'Πορτοφόλι πιστώθηκε' }
}

function actorBadgeStyle(type: string): string {
  switch (type) {
    case 'client': return 'bg-blue-100 text-blue-700'
    case 'garage': return 'bg-violet-100 text-violet-700'
    case 'admin':  return 'bg-orange-100 text-orange-700'
    case 'system': return 'bg-gray-100 text-gray-700'
    default:       return 'bg-surface-container text-on-surface/70'
  }
}

function relTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('el-GR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  } catch {
    return iso
  }
}

export default function RequestTimeline({ requestId }: RequestTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/requests/${requestId}/timeline`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) setError(body.error || `HTTP ${res.status}`)
          return
        }
        const data = await res.json()
        if (!cancelled) setEvents(data.events || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [requestId])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden mt-6">
      <div className="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">history</span>
          Timeline (forensic)
        </h2>
        {events && (
          <span className="text-xs text-secondary">{events.length} events</span>
        )}
      </div>

      {events === null && !error && (
        <div className="p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      )}

      {error && (
        <div className="p-6 text-center text-sm text-red-600">
          Σφάλμα φόρτωσης timeline: {error}
        </div>
      )}

      {events && events.length === 0 && (
        <div className="p-8 text-center text-sm text-on-surface/50">
          Δεν υπάρχουν events για αυτό το αίτημα.
        </div>
      )}

      {events && events.length > 0 && (
        <ol className="divide-y divide-outline-variant/10">
          {events.map((e) => {
            const viz = EVENT_VIZ[e.eventName] || { icon: 'history', color: 'text-secondary' }
            const label = viz.label || e.eventName
            const hasMeta = e.metadata && Object.keys(e.metadata).length > 0
            const isExpanded = expanded.has(e.eventId)
            return (
              <li key={e.eventId} className="px-5 py-3 hover:bg-surface-container-low transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-[20px] ${viz.color} mt-0.5`}>
                    {viz.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">{label}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${actorBadgeStyle(e.actorType)}`}>
                        {e.actorType}
                      </span>
                      {e.actorName && (
                        <span className="text-xs text-on-surface/70 truncate">{e.actorName}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-secondary mt-0.5 font-mono">
                      {relTime(e.timestamp)}
                      {e.source && <span className="ml-2 opacity-70">· {e.source}</span>}
                    </div>
                    {hasMeta && (
                      <button
                        onClick={() => toggle(e.eventId)}
                        className="text-[11px] text-primary mt-1 hover:underline"
                      >
                        {isExpanded ? 'Απόκρυψη metadata' : 'Εμφάνιση metadata'}
                      </button>
                    )}
                    {hasMeta && isExpanded && (
                      <pre className="mt-2 text-[11px] bg-surface-container rounded p-2 overflow-x-auto max-w-full">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
