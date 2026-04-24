'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'

interface GarageBreakdown {
  garageId: string
  garageName: string
  appointmentCount: number
  totalRevenue: number
  commission: number
}

interface CommissionsStats {
  month: string
  commissionPercent: number
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
    activeGaragesCount: number
  }
  byGarage: GarageBreakdown[]
}

const MONTH_LABELS = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος',
]

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

export default function CommissionsPage() {
  const router = useRouter()
  const [month, setMonth] = useState<string>(currentMonth())
  const [data, setData] = useState<CommissionsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const monthOptions = useMemo(() => lastNMonths(12), [])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/commissions/stats?month=${month}`)
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
      header: 'Ραντεβού',
      sortable: true,
      render: (item) => item.appointmentCount,
    },
    {
      key: 'totalRevenue',
      header: 'Συνολικά Έσοδα',
      sortable: true,
      render: (item) => formatEUR(item.totalRevenue),
    },
    {
      key: 'commission',
      header: `Προμήθεια (${data?.commissionPercent ?? 15}%)`,
      sortable: true,
      render: (item) => (
        <span className="font-semibold text-primary">{formatEUR(item.commission)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: () => (
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
            Υπολογισμός 15% επί ολοκληρωμένων ραντεβού — οφειλές προς εξόφληση στο τέλος του μήνα
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
          label="Ολοκληρωμένα Ραντεβού"
          value={loading ? '...' : (data?.totals.appointmentCount ?? 0)}
          color="primary"
        />
        <StatCard
          icon="payments"
          label="Συνολικά Έσοδα"
          value={loading ? '...' : formatEUR(data?.totals.totalRevenue ?? 0)}
          color="secondary"
        />
        <StatCard
          icon="account_balance_wallet"
          label={`Προμήθεια (${data?.commissionPercent ?? 15}%)`}
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

      <h2 className="text-lg font-semibold text-on-surface mb-3">Αναλυτικά ανά Συνεργείο</h2>
      <DataTable
        columns={columns}
        data={data?.byGarage ?? []}
        keyField="garageId"
        loading={loading}
        emptyMessage="Δεν υπάρχουν ολοκληρωμένα ραντεβού για αυτόν τον μήνα"
        onRowClick={(item) => router.push(`/admin/commissions/${item.garageId}?month=${month}`)}
      />
    </div>
  )
}
