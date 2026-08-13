'use client'

import { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

interface PaymentStats {
  totalRevenue: number
  paymentCount: number
  avgPayment: number
  failedCount: number
}

interface PaymentRecord {
  paymentId: string
  clientId: string
  amount: number
  status: string
  createdAt: string
  description?: string
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const columns: Column<PaymentRecord>[] = [
  { key: 'createdAt', header: 'Date', sortable: true, render: (item: PaymentRecord) => new Date(item.createdAt).toLocaleString() },
  { key: 'clientId', header: 'Client ID' },
  { key: 'amount', header: 'Amount', sortable: true, render: (item: PaymentRecord) => `${(item.amount / 100).toFixed(2)}` },
  {
    key: 'status',
    header: 'Status',
    render: (item: PaymentRecord) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        item.status === 'succeeded' ? 'bg-green-100 text-green-700' :
        item.status === 'failed' ? 'bg-red-100 text-red-700' :
        'bg-yellow-100 text-yellow-700'
      }`}>
        {item.status}
      </span>
    )
  },
  { key: 'description', header: 'Description', render: (item: PaymentRecord) => item.description || '-' },
]

export default function PaymentsPage() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setListLoading(true)
      try {
        const [statsRes, listRes] = await Promise.all([
          fetch(`/api/admin/payments/stats/?from=${from}&to=${to}`),
          fetch(`/api/admin/payments/list/?from=${from}&to=${to}&limit=50`)
        ])
        if (statsRes.ok) setStats(await statsRes.json())
        if (listRes.ok) {
          const data = await listRes.json()
          setPayments(data.items || [])
        }
      } catch { /* empty */ }
      setLoading(false)
      setListLoading(false)
    }
    fetchData()
  }, [from, to])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Payment Analytics</h1>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon="payments"
          label="Total Revenue"
          value={loading ? '...' : `${((stats?.totalRevenue ?? 0) / 100).toFixed(2)}`}
          color="primary"
        />
        <StatCard
          icon="receipt"
          label="Payments"
          value={loading ? '...' : (stats?.paymentCount ?? 0)}
          color="secondary"
        />
        <StatCard
          icon="trending_up"
          label="Avg Payment"
          value={loading ? '...' : `${((stats?.avgPayment ?? 0) / 100).toFixed(2)}`}
          color="primary"
        />
        <StatCard
          icon="error"
          label="Failed"
          value={loading ? '...' : (stats?.failedCount ?? 0)}
          color="error"
        />
      </div>

      <h2 className="text-lg font-semibold text-on-surface mb-3">Recent Payments</h2>
      <DataTable
        columns={columns}
        data={payments}
        keyField="paymentId"
        loading={listLoading}
        emptyMessage="No payments found for this period"
      />
    </div>
  )
}
