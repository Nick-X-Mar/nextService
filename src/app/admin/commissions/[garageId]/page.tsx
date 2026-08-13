'use client'

import { useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import StatCard from '../../components/StatCard'
import DataTable, { type Column } from '../../components/DataTable'

interface AppointmentRow {
  requestId: string
  appointmentDate: string
  clientName: string
  vehicleLabel: string
  category: string
  appointmentPrice: number
  commission: number
}

interface GarageCommissionsData {
  month: string
  garageId: string
  garageName: string
  commissionPercent: number
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
  }
  appointments: AppointmentRow[]
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
  }, [garageId, month])

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
      render: (item) => item.category,
    },
    {
      key: 'appointmentPrice',
      header: 'Τιμή Ραντεβού',
      sortable: true,
      render: (item) => formatEUR(item.appointmentPrice),
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
          <p className="text-sm text-on-surface/60 mt-1">Προμήθειες — {monthLabel}</p>
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
          label="Ραντεβού"
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
      </div>

      <h2 className="text-lg font-semibold text-on-surface mb-3">Αναλυτικά Ραντεβού</h2>
      <DataTable
        columns={columns}
        data={data?.appointments ?? []}
        keyField="requestId"
        loading={loading}
        emptyMessage="Δεν υπάρχουν ολοκληρωμένα ραντεβού για αυτόν τον μήνα"
      />
    </div>
  )
}
