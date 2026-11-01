'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Spinner } from '@/components'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { getCategoryText } from '@/utils/categoryLabels'
import { athensToday } from '@/utils/athensTime'
import { euro } from '@/utils/money'
import { sumCents } from '@/lib/commission-basis'
import {
  SETTLEMENT_METHODS,
  SETTLEMENT_STATUS_LABELS,
  settlementMethodLabel,
  type GarageLedger,
  type LedgerJob,
  type LedgerJobState,
  type Settlement,
} from '@/types/settlements'
import { formatAppointment } from './offerStatus'

type Filter = 'all' | 'done' | 'cancelled'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Όλες' },
  { value: 'done', label: 'Εκτελεσμένες' },
  { value: 'cancelled', label: 'Ακυρωμένες' },
]

const STATE_LABELS: Record<LedgerJobState, { label: string; className: string }> = {
  upcoming: { label: 'Προγραμματισμένο', className: styles.statusAppointment },
  awaiting: { label: 'Εκκρεμεί δήλωση', className: styles.statusPending },
  completed: { label: 'Εκτελέστηκε', className: styles.statusCompleted },
  not_done: { label: 'Δεν έγινε', className: styles.statusCancelled },
  cancelled: { label: 'Ακυρώθηκε', className: styles.statusCancelled },
}

const SETTLEMENT_CHIP: Record<Settlement['status'], string> = {
  declared: styles.statusPending,
  confirmed: styles.statusCompleted,
  rejected: styles.statusCancelled,
}

const chip = (active: boolean) =>
  active
    ? 'bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap'
    : 'bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap hover:bg-surface-container-high transition-colors cursor-pointer'

const card = 'bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10'

function matches(job: LedgerJob, filter: Filter): boolean {
  if (filter === 'done') return job.state === 'completed'
  if (filter === 'cancelled') return job.state === 'cancelled' || job.state === 'not_done'
  return true
}

/** What the garage got for the job, net: what it declared, else the quote once the day has come. */
function garageNet(job: LedgerJob): number {
  if (job.declared) return job.declared.net
  if (job.state === 'awaiting' || job.state === 'completed') return job.quoted ?? 0
  return 0
}

/**
 * The garage's Πληρωμές tab: every job it was booked for, what each one came
 * to and the commission it bills, what it has paid NextService, and what it
 * still owes. A payment is declared here and counts at once; an admin then
 * confirms it against the bank.
 */
export default function GaragePayments() {
  const [ledger, setLedger] = useState<GarageLedger | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [declaring, setDeclaring] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/garage/payments/', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error)
      setLedger(data)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const jobs = useMemo(() => (ledger?.jobs ?? []).filter((j) => matches(j, filter)), [ledger, filter])
  const sums = useMemo(() => ({
    quoted: sumCents(jobs.map((j) => (j.state === 'cancelled' ? 0 : j.quoted ?? 0))),
    garage: sumCents(jobs.map(garageNet)),
    commission: sumCents(jobs.map((j) => j.commission)),
  }), [jobs])

  if (loadError && !ledger) {
    return (
      <div className={`${card} text-center`}>
        <p className="text-sm text-secondary mb-3">Δεν φορτώθηκαν οι πληρωμές.</p>
        <button onClick={load} className={styles.btnPrimary}>
          <Icon name="refresh" size="sm" />
          Δοκίμασε ξανά
        </button>
      </div>
    )
  }
  if (!ledger) {
    return (
      <div className="text-center py-12">
        <Spinner size="lg" className="text-primary mx-auto mb-3" />
        <p className="text-sm text-secondary">Φόρτωση πληρωμών...</p>
      </div>
    )
  }

  const { totals } = ledger
  const owes = totals.balance > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">Πληρωμές</h2>
        <p className="text-base text-secondary leading-relaxed mt-1">
          Οι εργασίες σου, η προμήθεια NextService και οι πληρωμές σου.
        </p>
      </div>

      {/* What is owed */}
      <section className={card} aria-label="Υπόλοιπο">
        <p className={styles.labelUpper}>Υπόλοιπο προς NextService</p>
        <p
          data-testid="ledger-balance"
          className={`text-4xl font-black tracking-tight mt-1 ${owes ? 'text-primary' : 'text-green-700'}`}
        >
          {euro(Math.abs(totals.balance))}
        </p>
        <p className="text-sm text-secondary mt-1">
          {owes ? 'οφειλόμενη προμήθεια' : totals.balance < 0 ? 'έχεις πληρώσει παραπάνω' : 'δεν οφείλεις τίποτα'}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-surface-container-low p-3">
            <dt className="text-xs text-on-surface-variant">Προμήθεια συνολικά</dt>
            <dd className="font-bold text-on-surface">{euro(totals.commission)}</dd>
          </div>
          <div className="rounded-lg bg-surface-container-low p-3">
            <dt className="text-xs text-on-surface-variant">Έχεις πληρώσει</dt>
            <dd className="font-bold text-on-surface">{euro(totals.paid)}</dd>
            {totals.paidUnconfirmed > 0 && (
              <dd className="text-[11px] text-on-surface-variant">{euro(totals.paidUnconfirmed)} σε έλεγχο</dd>
            )}
          </div>
        </dl>
        <button
          onClick={() => setDeclaring(true)}
          className="mt-4 w-full bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
        >
          <Icon name="payments" size="sm" />
          Δήλωση πληρωμής
        </button>
        <p className="text-xs text-on-surface-variant mt-2">
          Η προμήθεια είναι ποσοστό επί του ποσού χωρίς ΦΠΑ κάθε εργασίας και χρεώνεται από την ημέρα του ραντεβού.
        </p>
      </section>

      {/* Jobs */}
      <section className="space-y-4" aria-label="Εργασίες">
        <h3 className={styles.sectionTitle}>Εργασίες</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)} className={chip(filter === f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        <dl data-testid="ledger-sums" className="grid grid-cols-3 gap-2">
          {[
            { label: 'Προσφορές', value: sums.quoted },
            { label: 'Συνεργείο', value: sums.garage },
            { label: 'Προμήθεια', value: sums.commission },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-container-low p-3 min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant truncate">{s.label}</dt>
              <dd className="text-sm sm:text-base font-black text-on-surface truncate">{euro(s.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-on-surface-variant -mt-2">Όλα τα ποσά χωρίς ΦΠΑ.</p>

        {jobs.length === 0 ? (
          <div className={`${card} text-center text-sm text-secondary`}>Δεν υπάρχουν εργασίες εδώ.</div>
        ) : (
          jobs.map((job) => <JobCard key={job.requestId} job={job} />)
        )}
      </section>

      {/* Payments */}
      <section className="space-y-3" aria-label="Ιστορικό πληρωμών">
        <h3 className={styles.sectionTitle}>Ιστορικό πληρωμών</h3>
        {ledger.settlements.length === 0 ? (
          <div className={`${card} text-center text-sm text-secondary`}>Δεν έχεις δηλώσει πληρωμή ακόμα.</div>
        ) : (
          ledger.settlements.map((s) => (
            <div key={s.settlementId} data-testid="settlement" className={`${card} flex items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="font-bold text-on-surface">{euro(s.amount)}</p>
                <p className="text-xs text-secondary truncate">
                  {new Date(`${s.paidOn}T12:00:00`).toLocaleDateString('el-GR')} · {settlementMethodLabel(s.method)}
                  {s.reference ? ` · ${s.reference}` : ''}
                </p>
              </div>
              <span className={`${SETTLEMENT_CHIP[s.status]} shrink-0`}>{SETTLEMENT_STATUS_LABELS[s.status]}</span>
            </div>
          ))
        )}
      </section>

      <DeclarePaymentModal
        isOpen={declaring}
        suggested={owes ? totals.balance : undefined}
        onClose={() => setDeclaring(false)}
        onDeclared={load}
      />
    </div>
  )
}

function JobCard({ job }: { job: LedgerJob }) {
  const state = STATE_LABELS[job.state]
  const rows: { label: string; value: string }[] = []
  if (job.quoted !== null) rows.push({ label: 'Προσφορά', value: `${euro(job.quoted)} + ΦΠΑ` })
  if (job.declared) rows.push({ label: 'Τελικό ποσό', value: `${euro(job.declared.net)} + ΦΠΑ` })
  if (job.state !== 'upcoming' && job.state !== 'cancelled') {
    rows.push({
      label: `Προμήθεια ${job.commissionPercent}%`,
      value: job.commission > 0 ? euro(job.commission) : '—',
    })
  }

  return (
    <article data-testid="ledger-job" className={card}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-on-surface truncate">{job.vehicle || getCategoryText(job.category || '')}</p>
          <p className="text-xs text-secondary truncate">
            {[getCategoryText(job.category || ''), job.clientFirstName].filter(Boolean).join(' · ')}
          </p>
          {job.appointmentDate && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              {formatAppointment(job.appointmentDate, job.appointmentTime)}
            </p>
          )}
        </div>
        <span className={`${state.className} shrink-0`}>{state.label}</span>
      </div>
      {rows.length > 0 && (
        <dl className="space-y-1 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">{r.label}</dt>
              <dd className="font-bold text-on-surface text-right">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {job.reason && (
        <p className="text-xs text-on-surface-variant mt-2">
          <span className="font-bold">Λόγος:</span> {job.reason}
        </p>
      )}
      {job.state === 'awaiting' && (
        <p className="text-xs text-primary mt-2">
          Δήλωσε στα Ραντεβού πώς πήγε. Μέχρι τότε η προμήθεια υπολογίζεται στην τιμή της προσφοράς.
        </p>
      )}
      {job.state === 'not_done' && job.outcomeReview === 'pending' && (
        <p className="text-xs text-on-surface-variant mt-2">Ελέγχεται με τον πελάτη.</p>
      )}
      {job.clientConfirmation === 'disputed' && (
        <p className="text-xs text-tertiary mt-2">Ο πελάτης δεν συμφωνεί με τη δήλωση. Θα επικοινωνήσουμε μαζί σου.</p>
      )}
    </article>
  )
}

function DeclarePaymentModal({
  isOpen,
  suggested,
  onClose,
  onDeclared,
}: {
  isOpen: boolean
  suggested?: number
  onClose: () => void
  onDeclared: () => void
}) {
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(athensToday())
  const [method, setMethod] = useState<string>('bank_transfer')
  const [reference, setReference] = useState('')
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()
  const submitting = isPending()

  useEffect(() => {
    if (isOpen) {
      setAmount(suggested ? suggested.toFixed(2) : '')
      setPaidOn(athensToday())
    }
  }, [isOpen, suggested])

  const close = () => {
    if (!submitting) onClose()
  }

  const submit = () =>
    run(async () => {
      const value = Number(amount.replace(',', '.'))
      if (!Number.isFinite(value) || value <= 0) {
        showError('Γράψε το ποσό που πλήρωσες.')
        return
      }
      const res = await fetch('/api/garage/payments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value, paidOn, method, reference }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.')
        return
      }
      success('Η πληρωμή καταχωρήθηκε.')
      setReference('')
      onDeclared()
      onClose()
    })

  const label = 'block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1'
  const field = 'w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface'

  return (
    <Modal isOpen={isOpen} onClose={close} title="Δήλωση πληρωμής" size="md">
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          Δήλωσε το ποσό που κατέθεσες στο NextService. Αφαιρείται από την προμήθεια που οφείλεις και το
          επιβεβαιώνουμε με την τράπεζα.
        </p>
        <div>
          <label htmlFor="settlement-amount" className={label}>
            Ποσό <span className="text-tertiary">*</span>
          </label>
          <div className="relative">
            <input
              id="settlement-amount"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="settlement-date" className={label}>Ημερομηνία</label>
            <input
              id="settlement-date"
              type="date"
              value={paidOn}
              max={athensToday()}
              onChange={(e) => setPaidOn(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="settlement-method" className={label}>Τρόπος</label>
            <select id="settlement-method" value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
              {SETTLEMENT_METHODS.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="settlement-reference" className={label}>Αριθμός συναλλαγής (προαιρετικά)</label>
          <input
            id="settlement-reference"
            type="text"
            value={reference}
            maxLength={200}
            onChange={(e) => setReference(e.target.value)}
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
            {submitting ? <Spinner size="sm" /> : <Icon name="check" size="sm" />}
            Καταχώρηση
          </button>
        </div>
      </div>
    </Modal>
  )
}
