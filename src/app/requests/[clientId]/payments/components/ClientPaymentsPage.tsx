'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Spinner } from '@/components'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useNotifications } from '@/contexts/NotificationsContext'
import { getCategoryText } from '@/utils/categoryLabels'
import { euro } from '@/utils/money'
import { sumCents } from '@/lib/commission-basis'
import type { ClientJob } from '@/types/clientJobs'
import type { LedgerJobState } from '@/types/settlements'

type Filter = 'all' | 'done' | 'cancelled'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Όλες' },
  { value: 'done', label: 'Εκτελεσμένες' },
  { value: 'cancelled', label: 'Ακυρωμένες' },
]

const STATE_LABELS: Record<LedgerJobState, { label: string; className: string }> = {
  upcoming: { label: 'Προγραμματισμένο', className: styles.statusAppointment },
  awaiting: { label: 'Σε εξέλιξη', className: styles.statusPending },
  completed: { label: 'Εκτελέστηκε', className: styles.statusCompleted },
  not_done: { label: 'Δεν έγινε', className: styles.statusCancelled },
  cancelled: { label: 'Ακυρώθηκε', className: styles.statusCancelled },
}

const chip = (active: boolean) =>
  active
    ? 'bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap'
    : 'bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap hover:bg-surface-container-high transition-colors cursor-pointer'

const card = 'bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10'

function matches(job: ClientJob, filter: Filter): boolean {
  if (filter === 'done') return job.state === 'completed'
  if (filter === 'cancelled') return job.state === 'cancelled' || job.state === 'not_done'
  return true
}

/**
 * The client's Πληρωμές page: every booking, what the garage quoted and what
 * it says it charged, and a one-tap "σωστό / δεν συμφωνώ" on each closed job.
 * The client pays the garage directly, so nothing here is owed to NextService.
 */
export default function ClientPaymentsPage() {
  const [jobs, setJobs] = useState<ClientJob[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [disputing, setDisputing] = useState<ClientJob | null>(null)
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()
  const { refresh: refreshNotifications } = useNotifications()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/requests/jobs/', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error)
      setJobs(data.jobs)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => (jobs ?? []).filter((j) => matches(j, filter)), [jobs, filter])
  const paid = useMemo(() => sumCents(visible.map((j) => j.declared?.gross ?? 0)), [visible])

  const confirm = (job: ClientJob) =>
    run(job.requestId, async () => {
      const res = await fetch(`/api/requests/${job.requestId}/confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.')
        return
      }
      success('Ευχαριστούμε για την επιβεβαίωση.')
      refreshNotifications()
      await load()
    })

  return (
    <section className="bg-surface">
      <div className="max-w-2xl mx-auto px-4 pt-2 pb-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Πληρωμές</h1>
          <p className="text-sm text-secondary mt-1">
            Οι εργασίες σας με τα συνεργεία. Την εργασία την πληρώνετε απευθείας στο συνεργείο.
          </p>
        </div>

        {loadError && !jobs ? (
          <div className={`${card} text-center`}>
            <p className="text-sm text-secondary mb-3">Δεν φορτώθηκαν οι πληρωμές.</p>
            <button onClick={load} className={styles.btnPrimary}>
              <Icon name="refresh" size="sm" />
              Δοκιμάστε ξανά
            </button>
          </div>
        ) : !jobs ? (
          <div className="text-center py-12">
            <Spinner size="lg" className="text-primary mx-auto mb-3" />
            <p className="text-sm text-secondary">Φόρτωση...</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {FILTERS.map((f) => (
                <button key={f.value} onClick={() => setFilter(f.value)} className={chip(filter === f.value)}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className={card}>
              <p className={styles.labelUpper}>Πληρώσατε συνολικά</p>
              <p data-testid="client-paid-total" className="text-3xl font-black tracking-tight text-on-surface mt-1">
                {euro(paid)}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Με ΦΠΑ, όπως το δήλωσαν τα συνεργεία για τις εργασίες εδώ.
              </p>
            </div>

            {visible.length === 0 ? (
              <div className={`${card} text-center text-sm text-secondary`}>Δεν υπάρχουν εργασίες εδώ.</div>
            ) : (
              visible.map((job) => {
                const state = STATE_LABELS[job.state]
                return (
                  <article key={job.requestId} data-testid="client-job" className={card}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-bold text-on-surface truncate">
                          {job.garage?.companyName || 'Συνεργείο'}
                        </p>
                        <p className="text-xs text-secondary truncate">
                          {[job.garage?.municipality, getCategoryText(job.category || ''), job.vehicle]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {job.appointmentDate && (
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {new Date(`${job.appointmentDate}T12:00:00`).toLocaleDateString('el-GR')}
                            {job.appointmentTime ? `, ${job.appointmentTime}` : ''}
                          </p>
                        )}
                      </div>
                      <span className={`${state.className} shrink-0`}>{state.label}</span>
                    </div>

                    <dl className="space-y-1 text-sm">
                      {job.quoted !== null && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-on-surface-variant">Προσφορά</dt>
                          <dd className="font-bold text-on-surface">{euro(job.quoted)} + ΦΠΑ</dd>
                        </div>
                      )}
                      {job.declared && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-on-surface-variant">Χρέωση συνεργείου</dt>
                          <dd className="font-bold text-on-surface text-right">
                            {euro(job.declared.gross)}
                            <span className="block text-[11px] font-normal text-on-surface-variant">
                              {euro(job.declared.net)} + ΦΠΑ {euro(job.declared.vat)}
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>
                    {job.reason && (
                      <p className="text-xs text-on-surface-variant mt-2">
                        <span className="font-bold">Σύμφωνα με το συνεργείο:</span> {job.reason}
                      </p>
                    )}

                    {job.canConfirm && (
                      <div className="mt-4 border-t border-outline-variant/20 pt-4">
                        <p className="text-sm font-bold text-on-surface mb-2">
                          {job.state === 'completed'
                            ? job.declared
                              ? `Πληρώσατε ${euro(job.declared.gross)};`
                              : 'Έγινε η εργασία;'
                            : 'Το συνεργείο δήλωσε ότι η εργασία δεν έγινε. Ισχύει;'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => confirm(job)}
                            disabled={isPending(job.requestId)}
                            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2.5 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-60"
                          >
                            {isPending(job.requestId) ? <Spinner size="sm" /> : <Icon name="check" size="sm" />}
                            Ναι, σωστό
                          </button>
                          <button
                            onClick={() => setDisputing(job)}
                            className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-sm font-bold text-on-surface active:scale-95"
                          >
                            <Icon name="report" size="sm" />
                            Όχι
                          </button>
                        </div>
                      </div>
                    )}
                    {job.confirmation?.status === 'confirmed' && (
                      <p className="text-xs text-green-700 mt-3 flex items-center gap-1">
                        <Icon name="check_circle" size="sm" filled /> Το επιβεβαιώσατε
                      </p>
                    )}
                    {job.confirmation?.status === 'disputed' && (
                      <p className="text-xs text-tertiary mt-3 flex items-center gap-1">
                        <Icon name="report" size="sm" /> Δηλώσατε διαφωνία — θα επικοινωνήσουμε μαζί σας
                      </p>
                    )}
                  </article>
                )
              })
            )}
          </>
        )}
      </div>

      <DisputeModal
        job={disputing}
        onClose={() => setDisputing(null)}
        onDone={() => {
          refreshNotifications()
          load()
        }}
      />
    </section>
  )
}

function DisputeModal({ job, onClose, onDone }: { job: ClientJob | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()
  const submitting = isPending()

  useEffect(() => {
    setAmount('')
    setNote('')
  }, [job])

  const close = () => {
    if (!submitting) onClose()
  }

  const submit = () =>
    run(async () => {
      if (!job) return
      const value = amount.trim() ? Number(amount.replace(',', '.')) : undefined
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        showError('Μη έγκυρο ποσό.')
        return
      }
      if (value === undefined && !note.trim()) {
        showError('Πείτε μας τι έγινε ή πόσο πληρώσατε.')
        return
      }
      const res = await fetch(`/api/requests/${job.requestId}/confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disputed', amountPaid: value, note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκιμάστε ξανά.')
        return
      }
      success('Καταχωρήθηκε. Θα επικοινωνήσουμε μαζί σας.')
      onDone()
      onClose()
    })

  const label = 'block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1'
  const field = 'w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface'

  return (
    <Modal isOpen={!!job} onClose={close} title="Τι έγινε;" size="md">
      <div className="space-y-4">
        {job?.state === 'completed' && (
          <div>
            <label htmlFor="dispute-amount" className={label}>Πόσο πληρώσατε (με ΦΠΑ)</label>
            <div className="relative">
              <input
                id="dispute-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${field} pr-8 text-base font-medium`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">€</span>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="dispute-note" className={label}>Σχόλιο</label>
          <textarea
            id="dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={job?.state === 'completed' ? 'Τι διαφέρει από τη δήλωση του συνεργείου' : 'Η εργασία έγινε; Πείτε μας τι έγινε'}
            className={field}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container active:scale-95 disabled:opacity-50"
          >
            Άκυρο
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2.5 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Spinner size="sm" /> : <Icon name="send" size="sm" />}
            Αποστολή
          </button>
        </div>
      </div>
    </Modal>
  )
}
