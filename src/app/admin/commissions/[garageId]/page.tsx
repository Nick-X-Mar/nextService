'use client'

import { useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import StatCard from '../../components/StatCard'
import DataTable, { type Column } from '../../components/DataTable'
import { athensToday } from '@/utils/athensTime'
import { getCategoryText } from '@/utils/categoryLabels'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import CommissionRateCard, { formatPercent } from '../../components/CommissionRateCard'
import {
  SETTLEMENT_STATUS_LABELS,
  settlementMethodLabel,
  type LedgerTotals,
  type Settlement,
} from '@/types/settlements'

interface ClientWord {
  status: 'confirmed' | 'disputed'
  amountPaid?: number
  note?: string
}

interface AppointmentRow {
  requestId: string
  appointmentDate: string
  clientName: string
  vehicleLabel: string
  category: string
  /** The quote, net of VAT. */
  appointmentPrice: number
  /** The net figure the commission was taken from. */
  basisAmount: number
  basis: 'declared' | 'quoted'
  commission: number
  /** The rate this job was billed at. */
  commissionPercent: number
  /** `job`: frozen when it was completed · `garage`/`default`: an older job, billed at today's rate. */
  rateSource: 'job' | 'garage' | 'default'
  /** The appointment day came and the garage has not declared — billed on the agreed price meanwhile. */
  undeclared: boolean
  /** Why the garage charged less than it quoted. */
  reason: string | null
  clientConfirmation: ClientWord | null
}

interface FlaggedRow {
  requestId: string
  appointmentDate: string
  appointmentTime: string
  clientName: string
  clientPhone: string
  clientEmail: string
  vehicleLabel: string
  category: string
  outcome: 'no_show' | 'not_done'
  garageNotes: string
  appointmentPrice: number
  commissionIfBilled: number
  reviewStatus: 'pending' | 'confirmed' | 'rejected'
  reason: string | null
  clientConfirmation: ClientWord | null
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
}

interface GarageCommissionsData {
  month: string
  garageId: string
  garageName: string
  /** The garage's rate today — what the jobs it completes from now on are billed at. */
  commissionPercent: number
  hasCustomRate: boolean
  defaultCommissionPercent: number
  rateSetAt?: string
  rateSetBy?: string
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
  }
  appointments: AppointmentRow[]
  flagged: FlaggedRow[]
  ledger: { totals: LedgerTotals; settlements: Settlement[] }
}

/** The client's answer on their Πληρωμές page, as one short line. */
function ClientWordLine({ word }: { word: ClientWord | null }) {
  if (!word) return <p className="text-[11px] text-on-surface/50">Ο πελάτης δεν έχει απαντήσει</p>
  if (word.status === 'confirmed') return <p className="text-[11px] text-green-700 font-bold">Ο πελάτης επιβεβαίωσε</p>
  return (
    <p className="text-[11px] text-tertiary font-bold">
      Ο πελάτης διαφωνεί
      {typeof word.amountPaid === 'number' ? ` · λέει ότι πλήρωσε ${formatEUR(word.amountPaid)}` : ''}
      {word.note ? ` · «${word.note}»` : ''}
    </p>
  )
}

const MONTH_LABELS = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος',
]

function currentMonth(): string {
  return athensToday().slice(0, 7)
}

function lastNMonths(n: number): { value: string; label: string }[] {
  const now = new Date()
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`
    out.push({ value, label })
  }
  return out
}

function formatEUR(amount: number): string {
  return amount.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export default function GarageCommissionsPage({ params }: { params: Promise<{ garageId: string }> }) {
  const { garageId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const monthParam = searchParams.get('month')
  const initialMonth = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : currentMonth()

  const [month, setMonth] = useState<string>(initialMonth)
  const [data, setData] = useState<GarageCommissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  const monthOptions = useMemo(() => lastNMonths(12), [])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/commissions/garage/${garageId}/?month=${month}`)
        if (res.ok) {
          const json = (await res.json()) as GarageCommissionsData
          if (!cancelled) setData(json)
        }
      } catch { /* empty */ }
      if (!cancelled) setLoading(false)
    }
    fetchData()
    return () => { cancelled = true }
  }, [garageId, month, reload])

  function changeMonth(value: string) {
    setMonth(value)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('month', value)
    router.replace(`/admin/commissions/${garageId}?${params.toString()}`)
  }

  const columns: Column<AppointmentRow>[] = [
    {
      key: 'appointmentDate',
      header: 'Ημερομηνία',
      sortable: true,
      render: (item) => formatDate(item.appointmentDate),
    },
    {
      key: 'clientName',
      header: 'Πελάτης',
      sortable: true,
      render: (item) => item.clientName,
    },
    {
      key: 'vehicleLabel',
      header: 'Όχημα',
      render: (item) => item.vehicleLabel,
    },
    {
      key: 'category',
      header: 'Κατηγορία',
      render: (item) => getCategoryText(item.category),
    },
    {
      key: 'appointmentPrice',
      header: 'Προσφορά (χωρίς ΦΠΑ)',
      sortable: true,
      render: (item) => formatEUR(item.appointmentPrice),
    },
    {
      key: 'basisAmount',
      header: 'Βάση προμήθειας (χωρίς ΦΠΑ)',
      sortable: true,
      render: (item) => (
        <div>
          <span>{formatEUR(item.basisAmount)}</span>
          <p className={`text-[11px] ${item.undeclared ? 'font-bold text-tertiary' : 'text-on-surface/50'}`}>
            {item.basis === 'declared' ? 'Δηλωμένο ποσό' : item.undeclared ? 'Δεν έχει δηλωθεί — βάσει προσφοράς' : 'Βάσει προσφοράς'}
          </p>
          {item.reason && <p className="text-[11px] text-on-surface/70">Λόγος: {item.reason}</p>}
          {!item.undeclared && <ClientWordLine word={item.clientConfirmation} />}
        </div>
      ),
    },
    {
      key: 'commission',
      header: 'Προμήθεια',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-semibold text-primary">{formatEUR(item.commission)}</span>
          <p className="text-[11px] text-on-surface/50">
            {formatPercent(item.commissionPercent)}
            {item.rateSource !== 'job' && ' · τρέχον ποσοστό'}
          </p>
        </div>
      ),
    },
    {
      key: 'requestId',
      header: '',
      render: (item) => (
        <Link
          href={`/admin/requests/${item.requestId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary text-xs hover:underline inline-flex items-center gap-1"
        >
          Άνοιγμα
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
        </Link>
      ),
    },
  ]

  const monthLabel = useMemo(() => {
    const opt = monthOptions.find((o) => o.value === month)
    return opt?.label ?? month
  }, [month, monthOptions])

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/commissions?month=${month}`}
          className="text-sm text-on-surface/60 hover:text-primary inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Πίσω στις προμήθειες
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface">
            {data?.garageName ?? 'Συνεργείο'}
          </h1>
          <p className="text-sm text-on-surface/60 mt-1">
            Προμήθειες — {monthLabel}. Δεν περιλαμβάνονται ραντεβού όπου ο πελάτης δεν ήρθε ή η εργασία δεν έγινε.
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon="event_available"
          label="Εργασίες"
          value={loading ? '...' : (data?.totals.appointmentCount ?? 0)}
          color="primary"
        />
        <StatCard
          icon="payments"
          label="Καθαρά έσοδα (χωρίς ΦΠΑ)"
          value={loading ? '...' : formatEUR(data?.totals.totalRevenue ?? 0)}
          color="secondary"
        />
        <StatCard
          icon="account_balance_wallet"
          label="Προμήθεια"
          value={loading ? '...' : formatEUR(data?.totals.commission ?? 0)}
          color="tertiary"
        />
      </div>

      {data && (
        <CommissionRateCard
          garageId={garageId}
          data={data}
          onSaved={(rate) => setData((d) => (d ? { ...d, ...rate } : d))}
        />
      )}

      {data && (
        <SettlementsCard
          totals={data.ledger.totals}
          settlements={data.ledger.settlements}
          onReviewed={() => setReload((n) => n + 1)}
        />
      )}

      {data && data.flagged.length > 0 && (
        <FlaggedJobs
          rows={data.flagged}
          onReviewed={(requestId, review) => {
            setData((d) => d && {
              ...d,
              flagged: d.flagged.map((f) => (f.requestId === requestId ? { ...f, ...review } : f)),
            })
            // The billed rows and totals follow the decision.
            setReload((n) => n + 1)
          }}
        />
      )}

      <h2 className="text-lg font-semibold text-on-surface mb-3">Ανάλυση ανά εργασία</h2>
      <DataTable
        columns={columns}
        data={data?.appointments ?? []}
        keyField="requestId"
        loading={loading}
        emptyMessage="Δεν υπάρχουν ολοκληρωμένες εργασίες για αυτόν τον μήνα"
      />
    </div>
  )
}

const OUTCOME_LABEL: Record<FlaggedRow['outcome'], string> = {
  no_show: 'Ο πελάτης δεν ήρθε',
  not_done: 'Η εργασία δεν έγινε',
}

/**
 * Jobs the garage closed as not having happened. Not billed until an admin
 * has checked with the client: "Επιβεβαιώθηκε" waives the commission for good,
 * "Έγινε κανονικά" bills the job on its agreed price. Either can be changed.
 */
function FlaggedJobs({
  rows,
  onReviewed,
}: {
  rows: FlaggedRow[]
  onReviewed: (requestId: string, review: Pick<FlaggedRow, 'reviewStatus' | 'reviewedAt' | 'reviewedBy' | 'reviewNote'>) => void
}) {
  const { run, isPending } = useAsyncTask()
  const [error, setError] = useState('')

  const decide = (row: FlaggedRow, decision: 'confirmed' | 'rejected') =>
    run(`${decision}-${row.requestId}`, async () => {
      setError('')
      const res = await fetch(`/api/admin/commissions/review/${row.requestId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Η αποθήκευση απέτυχε')
        return
      }
      const r = json.outcomeReview as { status: FlaggedRow['reviewStatus']; reviewedAt?: string; reviewedBy?: string; note?: string }
      onReviewed(row.requestId, { reviewStatus: r.status, reviewedAt: r.reviewedAt, reviewedBy: r.reviewedBy, reviewNote: r.note })
    })

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-tertiary/20 p-5 mb-6" data-testid="flagged-jobs">
      <h3 className="font-bold text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-tertiary text-[20px]">flag</span>
        Δηλώθηκε ότι δεν έγιναν — προς έλεγχο
      </h3>
      <p className="text-xs text-on-surface/50 mt-1 mb-4">
        Δεν χρεώνονται μέχρι να το επιβεβαιώσετε με τον πελάτη. Αν ο πελάτης πει ότι η εργασία έγινε, χρεώνεται με
        την τιμή της προσφοράς.
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.requestId} className="rounded-lg border border-outline-variant/20 p-4" data-testid="flagged-job">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-bold text-on-surface">
                  {OUTCOME_LABEL[row.outcome]} · {formatDate(row.appointmentDate)}{row.appointmentTime ? ` ${row.appointmentTime}` : ''}
                </p>
                <p className="text-on-surface/70">
                  {row.vehicleLabel} · {getCategoryText(row.category)} · προσφορά {formatEUR(row.appointmentPrice)} ·
                  προμήθεια αν χρεωθεί {formatEUR(row.commissionIfBilled)}
                </p>
                <p className="text-on-surface/70 mt-1">
                  Πελάτης: <span className="font-medium text-on-surface">{row.clientName}</span>
                  {row.clientPhone && (
                    <> · <a href={`tel:${row.clientPhone}`} className="text-primary hover:underline">{row.clientPhone}</a></>
                  )}
                  {row.clientEmail && (
                    <> · <a href={`mailto:${row.clientEmail}`} className="text-primary hover:underline">{row.clientEmail}</a></>
                  )}
                </p>
                {row.reason && <p className="text-xs text-on-surface/70 mt-1">Λόγος: {row.reason}</p>}
                {row.garageNotes && <p className="text-xs text-on-surface/60 mt-1">Σημείωση συνεργείου: {row.garageNotes}</p>}
                <ClientWordLine word={row.clientConfirmation} />
              </div>
              <div className="text-right">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                  row.reviewStatus === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : row.reviewStatus === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {row.reviewStatus === 'pending' ? 'Προς έλεγχο' : row.reviewStatus === 'confirmed' ? 'Επιβεβαιώθηκε — χωρίς χρέωση' : 'Έγινε — χρεώνεται'}
                </span>
                {row.reviewedAt && (
                  <p className="text-[11px] text-on-surface/50 mt-1">
                    {new Date(row.reviewedAt).toLocaleDateString('el-GR')}{row.reviewedBy ? ` · ${row.reviewedBy}` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {row.reviewStatus !== 'confirmed' && (
                <button
                  onClick={() => decide(row, 'confirmed')}
                  disabled={isPending()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-container disabled:opacity-50"
                >
                  {isPending(`confirmed-${row.requestId}`) && <Spinner size="sm" />}
                  Επιβεβαιώθηκε — χωρίς χρέωση
                </button>
              )}
              {row.reviewStatus !== 'rejected' && (
                <button
                  onClick={() => decide(row, 'rejected')}
                  disabled={isPending()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                >
                  {isPending(`rejected-${row.requestId}`) && <Spinner size="sm" />}
                  Έγινε κανονικά — χρέωση
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-error mt-2">{error}</p>}
    </div>
  )
}

/**
 * What the garage owes overall and the payments it has declared. A declared
 * payment counts at once; "Βρέθηκε" confirms it against the bank, "Δεν βρέθηκε"
 * takes it back out of the balance. Either can be changed.
 */
function SettlementsCard({
  totals,
  settlements,
  onReviewed,
}: {
  totals: LedgerTotals
  settlements: Settlement[]
  onReviewed: () => void
}) {
  const { run, isPending } = useAsyncTask()
  const [error, setError] = useState('')

  const decide = (s: Settlement, decision: 'confirmed' | 'rejected') =>
    run(`${decision}-${s.settlementId}`, async () => {
      setError('')
      const res = await fetch(`/api/admin/commissions/settlements/${s.settlementId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Η αποθήκευση απέτυχε')
        return
      }
      onReviewed()
    })

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6" data-testid="settlements">
      <h3 className="font-bold text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
        Υπόλοιπο και πληρωμές (από την αρχή)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="rounded-lg bg-surface-container-low p-3">
          <p className="text-xs text-on-surface/60">Προμήθεια συνολικά</p>
          <p className="font-bold text-on-surface">{formatEUR(totals.commission)}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low p-3">
          <p className="text-xs text-on-surface/60">Πληρωμές</p>
          <p className="font-bold text-on-surface">{formatEUR(totals.paid)}</p>
          {totals.paidUnconfirmed > 0 && (
            <p className="text-[11px] text-amber-800">{formatEUR(totals.paidUnconfirmed)} προς έλεγχο</p>
          )}
        </div>
        <div className="rounded-lg bg-surface-container-low p-3">
          <p className="text-xs text-on-surface/60">Υπόλοιπο</p>
          <p data-testid="admin-balance" className={`font-bold ${totals.balance > 0 ? 'text-primary' : 'text-green-700'}`}>
            {formatEUR(totals.balance)}
          </p>
        </div>
      </div>
      {settlements.length === 0 ? (
        <p className="text-sm text-on-surface/50 mt-4">Το συνεργείο δεν έχει δηλώσει πληρωμή.</p>
      ) : (
        <div className="space-y-2 mt-4">
          {settlements.map((s) => (
            <div key={s.settlementId} data-testid="admin-settlement" className="rounded-lg border border-outline-variant/20 p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm min-w-0">
                <p className="font-bold text-on-surface">
                  {formatEUR(s.amount)} · {formatDate(s.paidOn)} · {settlementMethodLabel(s.method)}
                </p>
                {s.reference && <p className="text-xs text-on-surface/60 break-all">Αρ. συναλλαγής: {s.reference}</p>}
                {s.reviewedAt && (
                  <p className="text-[11px] text-on-surface/50">
                    {new Date(s.reviewedAt).toLocaleDateString('el-GR')}{s.reviewedBy ? ` · ${s.reviewedBy}` : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                  s.status === 'declared'
                    ? 'bg-amber-100 text-amber-800'
                    : s.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {SETTLEMENT_STATUS_LABELS[s.status]}
                </span>
                {s.status !== 'confirmed' && (
                  <button
                    onClick={() => decide(s, 'confirmed')}
                    disabled={isPending()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  >
                    {isPending(`confirmed-${s.settlementId}`) && <Spinner size="sm" />}
                    Βρέθηκε
                  </button>
                )}
                {s.status !== 'rejected' && (
                  <button
                    onClick={() => decide(s, 'rejected')}
                    disabled={isPending()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-container disabled:opacity-50"
                  >
                    {isPending(`rejected-${s.settlementId}`) && <Spinner size="sm" />}
                    Δεν βρέθηκε
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-error mt-2">{error}</p>}
    </div>
  )
}
