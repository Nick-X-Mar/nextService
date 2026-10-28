'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import { athensToday } from '@/utils/athensTime'

interface GarageBreakdown {
  garageId: string
  garageName: string
  appointmentCount: number
  totalRevenue: number
  commission: number
  /** How many of `appointmentCount` rest on a declared amount rather than the quote. */
  declaredCount: number
  /** Billed on the agreed price: the appointment day came and the garage has not declared. */
  undeclaredCount: number
  /** Said not to have happened, still to check with the client — not billed meanwhile. */
  pendingReviewCount: number
  /** The garage's rate today. */
  commissionPercent: number
  hasCustomRate: boolean
  /** Commission over revenue for the month — differs when the rate changed mid-month. */
  effectivePercent: number
}

interface CommissionsStats {
  month: string
  defaultCommissionPercent: number
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
    activeGaragesCount: number
    undeclaredCount: number
    pendingReviewCount: number
  }
  byGarage: GarageBreakdown[]
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

function formatPercent(value: number): string {
  return value.toLocaleString('el-GR', { maximumFractionDigits: 2 }) + '%'
}

function formatEUR(amount: number): string {
  return amount.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export default function CommissionsPage() {
  const { navigate, isNavigating } = useNavigation()
  const [month, setMonth] = useState<string>(currentMonth())
  const [data, setData] = useState<CommissionsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const monthOptions = useMemo(() => lastNMonths(12), [])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/commissions/stats/?month=${month}`)
        if (res.ok) {
          const json = (await res.json()) as CommissionsStats
          if (!cancelled) setData(json)
        }
      } catch { /* empty */ }
      if (!cancelled) setLoading(false)
    }
    fetchData()
    return () => { cancelled = true }
  }, [month])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.byGarage.slice(0, 15).map((g) => ({
      name: g.garageName.length > 22 ? g.garageName.slice(0, 22) + '…' : g.garageName,
      fullName: g.garageName,
      commission: g.commission,
      revenue: g.totalRevenue,
    }))
  }, [data])

  const garageHref = (garageId: string) => `/admin/commissions/${garageId}?month=${month}`

  const columns: Column<GarageBreakdown>[] = [
    {
      key: 'garageName',
      header: 'Συνεργείο',
      sortable: true,
      render: (item) => (
        <span className="font-medium text-on-surface">{item.garageName}</span>
      ),
    },
    {
      key: 'appointmentCount',
      header: 'Εργασίες',
      sortable: true,
      render: (item) => (
        <div>
          <span>{item.appointmentCount}</span>
          {item.declaredCount < item.appointmentCount && (
            // These rows are billed on the quote because the garage never
            // declared what it charged — an estimate, not a settled figure.
            <p className="text-[11px] text-on-surface/50">
              {item.appointmentCount - item.declaredCount} βάσει προσφοράς
              {item.undeclaredCount > 0 && ` (${item.undeclaredCount} χωρίς δήλωση)`}
            </p>
          )}
          {item.pendingReviewCount > 0 && (
            <p className="text-[11px] font-bold text-tertiary">
              {item.pendingReviewCount} προς έλεγχο
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'totalRevenue',
      header: 'Καθαρά έσοδα',
      sortable: true,
      render: (item) => formatEUR(item.totalRevenue),
    },
    {
      key: 'commissionPercent',
      header: 'Ποσοστό',
      sortable: true,
      render: (item) => (
        <div>
          <span>{formatPercent(item.commissionPercent)}</span>
          <p className="text-[11px] text-on-surface/50">
            {item.hasCustomRate ? 'συμφωνημένο' : 'προεπιλογή'}
            {/* Each job keeps the rate it was completed at, so a mid-month
                change shows up as a blended figure. */}
            {Math.abs(item.effectivePercent - item.commissionPercent) >= 0.01 && ` · μήνας ${formatPercent(item.effectivePercent)}`}
          </p>
        </div>
      ),
    },
    {
      key: 'commission',
      header: 'Προμήθεια',
      sortable: true,
      render: (item) => (
        <span className="font-semibold text-primary">{formatEUR(item.commission)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item) =>
        isNavigating(garageHref(item.garageId)) ? (
          <Spinner size="sm" className="text-primary" />
        ) : (
          <span className="material-symbols-outlined text-[18px] text-on-surface/40">chevron_right</span>
        ),
    },
  ]

  const monthLabel = useMemo(() => {
    const opt = monthOptions.find((o) => o.value === month)
    return opt?.label ?? month
  }, [month, monthOptions])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface">Προμήθειες Συνεργείων</h1>
          <p className="text-sm text-on-surface/60 mt-1">
            Κάθε ραντεβού χρεώνεται από την ημέρα του, με το ποσοστό που ίσχυε όταν κλείστηκε — το συμφωνημένο
            του συνεργείου ή την προεπιλογή {formatPercent(data?.defaultCommissionPercent ?? 15)} — επί της καθαρής
            αξίας (χωρίς ΦΠΑ): του ποσού που δήλωσε το συνεργείο, ή της προσφοράς όσο δεν έχει δηλώσει. Όσα
            δηλώθηκε ότι δεν έγιναν δεν χρεώνονται, εκτός αν ο έλεγχος με τον πελάτη δείξει ότι έγιναν.
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon="event_available"
          label="Ολοκληρωμένες εργασίες"
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
        <StatCard
          icon="garage"
          label="Ενεργά Συνεργεία"
          value={loading ? '...' : (data?.totals.activeGaragesCount ?? 0)}
          color="primary"
        />
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 mb-6">
        <h3 className="font-bold text-on-surface mb-1">Προμήθεια ανά Συνεργείο — {monthLabel}</h3>
        <p className="text-xs text-on-surface/50 mb-4">Top 15 συνεργεία ταξινομημένα βάσει προμήθειας</p>
        {loading ? (
          <div className="h-[320px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-on-surface/50">
            Δεν υπάρχουν ολοκληρωμένα ραντεβού για αυτόν τον μήνα
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant, #ccc)" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} €`} />
              <YAxis
                dataKey="name"
                type="category"
                width={180}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 12 }}
                formatter={(v, name) => [formatEUR(Number(v ?? 0)), name === 'commission' ? 'Προμήθεια' : 'Έσοδα']}
                labelFormatter={(_, payload) => {
                  const p = Array.isArray(payload) && payload[0]
                    ? (payload[0].payload as { fullName?: string })?.fullName
                    : null
                  return p ?? ''
                }}
              />
              <Bar dataKey="commission" fill="#6750A4" radius={[0, 4, 4, 0]} name="commission" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {(data?.totals.pendingReviewCount ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-tertiary/20 bg-tertiary/5 p-4 mb-4" data-testid="pending-review-banner">
          <span className="material-symbols-outlined text-tertiary">flag</span>
          <p className="text-sm text-on-surface">
            <span className="font-bold">{data?.totals.pendingReviewCount} εργασίες</span> δηλώθηκαν από το συνεργείο ότι
            δεν έγιναν (ο πελάτης δεν ήρθε ή η εργασία δεν έγινε). Δεν χρεώνονται μέχρι να το επιβεβαιώσετε με τον
            πελάτη — ανοίξτε το συνεργείο για τα στοιχεία επικοινωνίας.
          </p>
        </div>
      )}

      <h2 className="text-lg font-semibold text-on-surface mb-3">Αναλυτικά ανά Συνεργείο</h2>
      <DataTable
        columns={columns}
        data={data?.byGarage ?? []}
        keyField="garageId"
        loading={loading}
        emptyMessage="Δεν υπάρχουν ολοκληρωμένα ραντεβού για αυτόν τον μήνα"
        onRowClick={(item) => navigate(garageHref(item.garageId))}
      />
    </div>
  )
}
