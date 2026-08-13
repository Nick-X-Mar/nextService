'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

interface RequestStats {
  total: number
  byStatus: Record<string, number>
  funnel: {
    created: number
    offered: number
    accepted: number
    completed: number
  }
}

interface RequestRecord {
  id: string
  clientName: string
  category: string
  status: string
  createdAt: string
  offerCount: number
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const columns: Column<RequestRecord>[] = [
  { key: 'createdAt', header: 'Date', sortable: true, render: (item: RequestRecord) => new Date(item.createdAt).toLocaleDateString() },
  { key: 'clientName', header: 'Client', sortable: true },
  { key: 'category', header: 'Category', sortable: true },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (item: RequestRecord) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        item.status === 'completed' ? 'bg-green-100 text-green-700' :
        item.status === 'cancelled' ? 'bg-red-100 text-red-700' :
        item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
        'bg-blue-100 text-blue-700'
      }`}>
        {item.status}
      </span>
    )
  },
  { key: 'offerCount', header: 'Offers', sortable: true },
]

export default function RequestsPage() {
  const router = useRouter()
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [stats, setStats] = useState<RequestStats | null>(null)
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setListLoading(true)
      try {
        const [statsRes, listRes] = await Promise.all([
          fetch(`/api/admin/requests/stats/?from=${from}&to=${to}`),
          fetch(`/api/admin/requests/list/?from=${from}&to=${to}&limit=50`)
        ])
        if (statsRes.ok) setStats(await statsRes.json())
        if (listRes.ok) {
          const data = await listRes.json()
          setRequests(data.items || [])
        }
      } catch { /* empty */ }
      setLoading(false)
      setListLoading(false)
    }
    fetchData()
  }, [from, to])

  const funnel = stats?.funnel

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Request Analytics</h1>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="build" label="Total Requests" value={loading ? '...' : (stats?.total ?? 0)} color="primary" />
        <StatCard icon="local_offer" label="With Offers" value={loading ? '...' : (funnel?.offered ?? 0)} color="secondary" />
        <StatCard icon="handshake" label="Accepted" value={loading ? '...' : (funnel?.accepted ?? 0)} color="primary" />
        <StatCard icon="check_circle" label="Completed" value={loading ? '...' : (funnel?.completed ?? 0)} color="primary" />
      </div>

      {/* Conversion Funnel */}
      {funnel && funnel.created > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {[
              { label: 'Created', value: funnel.created, color: 'bg-primary/20' },
              { label: 'Received Offers', value: funnel.offered, color: 'bg-primary/40' },
              { label: 'Accepted', value: funnel.accepted, color: 'bg-primary/60' },
              { label: 'Completed', value: funnel.completed, color: 'bg-primary/80' },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-4">
                <span className="text-sm text-on-surface/70 w-36">{step.label}</span>
                <div className="flex-1 bg-surface-container rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-full flex items-center justify-end pr-2`}
                    style={{ width: `${Math.max(5, (step.value / funnel.created) * 100)}%` }}
                  >
                    <span className="text-xs font-medium text-on-surface">{step.value}</span>
                  </div>
                </div>
                <span className="text-xs text-on-surface/50 w-12 text-right">
                  {Math.round((step.value / funnel.created) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Breakdown */}
      {stats?.byStatus && Object.keys(stats.byStatus).length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-3">By Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="bg-surface-container rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-on-surface">{count}</p>
                <p className="text-xs text-on-surface/60 capitalize mt-1">{status.replace(/-/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request List */}
      <h2 className="text-lg font-semibold text-on-surface mb-3">Recent Requests</h2>
      <DataTable
        columns={columns}
        data={requests}
        keyField="id"
        loading={listLoading}
        emptyMessage="No requests found for this period"
        onRowClick={(item) => router.push(`/admin/requests/${item.id}/`)}
      />
    </div>
  )
}
