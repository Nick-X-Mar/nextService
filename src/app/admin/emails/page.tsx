'use client'

import { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

interface EmailStats {
  byStatus: Record<string, number>
  byTemplate: Record<string, number>
  total: number
}

interface EmailRecord {
  emailId: string
  recipient: string
  templateName: string
  status: string
  sentAt: string
  error?: string
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const columns: Column<EmailRecord>[] = [
  {
    key: 'sentAt',
    header: 'Date',
    sortable: true,
    render: (item: EmailRecord) => new Date(item.sentAt).toLocaleString(),
  },
  { key: 'recipient', header: 'Recipient', sortable: true },
  { key: 'templateName', header: 'Template', sortable: true },
  {
    key: 'status',
    header: 'Status',
    render: (item: EmailRecord) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        item.status === 'sent' ? 'bg-green-100 text-green-700' :
        item.status === 'failed' ? 'bg-red-100 text-red-700' :
        'bg-yellow-100 text-yellow-700'
      }`}>
        {item.status}
      </span>
    )
  },
  { key: 'error', header: 'Error', render: (item: EmailRecord) => item.error ? <span className="text-error text-xs">{item.error}</span> : '-' },
]

export default function EmailsPage() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [emails, setEmails] = useState<EmailRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/emails/stats?from=${from}&to=${to}`)
        if (res.ok) setStats(await res.json())
      } catch { /* empty */ }
      setLoading(false)
    }

    async function fetchList() {
      setListLoading(true)
      try {
        const res = await fetch(`/api/admin/emails/list?from=${from}&to=${to}&limit=50`)
        if (res.ok) {
          const data = await res.json()
          setEmails(data.items || [])
        }
      } catch { /* empty */ }
      setListLoading(false)
    }

    fetchStats()
    fetchList()
  }, [from, to])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Email Analytics</h1>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="mail" label="Total Sent" value={loading ? '...' : (stats?.byStatus?.sent ?? 0)} color="primary" />
        <StatCard icon="error" label="Failed" value={loading ? '...' : (stats?.byStatus?.failed ?? 0)} color="error" />
        <StatCard icon="send" label="Total Emails" value={loading ? '...' : (stats?.total ?? 0)} color="secondary" />
        <StatCard
          icon="trending_up"
          label="Success Rate"
          value={loading ? '...' : stats?.total ? `${Math.round(((stats.byStatus?.sent ?? 0) / stats.total) * 100)}%` : '-'}
          color="primary"
        />
      </div>

      {/* Template Breakdown */}
      {stats?.byTemplate && Object.keys(stats.byTemplate).length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-3">By Template</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.byTemplate)
              .sort(([, a], [, b]) => b - a)
              .map(([template, count]) => (
                <div key={template} className="bg-surface-container rounded-lg p-3">
                  <p className="text-lg font-bold text-on-surface">{count}</p>
                  <p className="text-xs text-on-surface/60 mt-0.5">{template.replace(/_/g, ' ')}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Email List */}
      <h2 className="text-lg font-semibold text-on-surface mb-3">Recent Emails</h2>
      <DataTable
        columns={columns}
        data={emails}
        keyField="emailId"
        loading={listLoading}
        emptyMessage="No emails found for this period"
      />
    </div>
  )
}
