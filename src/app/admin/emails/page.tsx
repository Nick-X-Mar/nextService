'use client'

import { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'
import DataTable, { type Column } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

interface EmailStats {
  byStatus: Record<string, number>
  byTemplate: Record<string, number>
  byTemplateStatus: Record<string, Record<string, number>>
  total: number
  funnel: {
    attempted: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    complained: number
    failed: number
  }
  rates: {
    deliveryRate: number
    bounceRate: number
    complaintRate: number
    openRate: number
    clickRate: number
    clickThroughRate: number
    failureRate: number
  }
  warnings: {
    bounceRateHigh: boolean
    complaintRateHigh: boolean
  }
  thresholds: {
    bounceRateWarn: number
    complaintRateWarn: number
  }
}

interface EmailRecord {
  emailId: string
  recipient: string
  templateName: string
  status: string
  sentAt: string
  deliveredAt?: string
  openedAt?: string
  clickedAt?: string
  bouncedAt?: string
  complainedAt?: string
  openCount?: number
  clickCount?: number
  bounceType?: string
  error?: string
}

// Status buckets that affect the badge color. Kept in sync with the stats
// API's TRACKED_STATUSES.
const STATUS_BUCKETS = {
  // Green — the email is doing what it should.
  success: new Set(['sent', 'delivered', 'opened', 'clicked']),
  // Red — something went wrong. Bounce/complaint/reject/fail all need eyes.
  error: new Set(['bounced', 'complained', 'rejected', 'failed']),
  // Yellow — intermediate/benign.
  pending: new Set(['queued', 'skipped', 'deliveryDelayed'])
}

function statusColor(status: string): string {
  if (STATUS_BUCKETS.error.has(status)) return 'bg-red-100 text-red-700'
  if (STATUS_BUCKETS.success.has(status)) return 'bg-green-100 text-green-700'
  return 'bg-yellow-100 text-yellow-700'
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function pct(n: number): string {
  return `${(n * 100).toFixed(n < 0.01 && n > 0 ? 2 : 1)}%`
}

const columns: Column<EmailRecord>[] = [
  {
    key: 'sentAt',
    header: 'Date',
    sortable: true,
    render: (item) => new Date(item.sentAt).toLocaleString()
  },
  { key: 'recipient', header: 'Recipient', sortable: true },
  {
    key: 'templateName',
    header: 'Template',
    sortable: true,
    render: (item) => item.templateName?.replace(/_/g, ' ') || '-'
  },
  {
    key: 'status',
    header: 'Status',
    render: (item) => (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(item.status)}`}
      >
        {item.status}
      </span>
    )
  },
  {
    key: 'lifecycle',
    header: 'Lifecycle',
    render: (item) => {
      // Compact icon row showing which events have fired for this email.
      const steps: Array<{ label: string; hit: boolean; danger?: boolean }> = [
        { label: 'sent', hit: !!item.sentAt && item.status !== 'skipped' && item.status !== 'queued' },
        { label: 'delivered', hit: !!item.deliveredAt },
        { label: 'opened', hit: !!item.openedAt },
        { label: 'clicked', hit: !!item.clickedAt },
        { label: 'bounced', hit: !!item.bouncedAt, danger: true },
        { label: 'complained', hit: !!item.complainedAt, danger: true }
      ]
      return (
        <div className="flex gap-1 flex-wrap">
          {steps
            .filter((s) => s.hit)
            .map((s) => (
              <span
                key={s.label}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  s.danger ? 'bg-red-100 text-red-700' : 'bg-surface-container text-on-surface/70'
                }`}
                title={s.label}
              >
                {s.label}
                {s.label === 'opened' && item.openCount && item.openCount > 1 ? ` ×${item.openCount}` : ''}
                {s.label === 'clicked' && item.clickCount && item.clickCount > 1 ? ` ×${item.clickCount}` : ''}
              </span>
            ))}
        </div>
      )
    }
  },
  {
    key: 'error',
    header: 'Error',
    render: (item) => (item.error ? <span className="text-error text-xs">{item.error}</span> : '-')
  }
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
      } catch {
        /* empty */
      }
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
      } catch {
        /* empty */
      }
      setListLoading(false)
    }

    fetchStats()
    fetchList()
  }, [from, to])

  const funnel = stats?.funnel
  const rates = stats?.rates
  const warn = stats?.warnings

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Email Analytics</h1>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {/* Reputation warnings — red banner if we're trending toward SES suspension */}
      {(warn?.bounceRateHigh || warn?.complaintRateHigh) && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800 mb-1">⚠ SES reputation warning</p>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            {warn?.bounceRateHigh && (
              <li>
                Bounce rate <strong>{pct(rates?.bounceRate ?? 0)}</strong> exceeds the{' '}
                {pct(stats?.thresholds?.bounceRateWarn ?? 0.03)} warning threshold. AWS auto-pauses the account at 10%.
              </li>
            )}
            {warn?.complaintRateHigh && (
              <li>
                Complaint rate <strong>{pct(rates?.complaintRate ?? 0)}</strong> exceeds the{' '}
                {pct(stats?.thresholds?.complaintRateWarn ?? 0.001)} warning threshold. AWS auto-pauses the account at 0.5%.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Funnel KPIs — top row: volume */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard icon="send" label="Attempted" value={loading ? '...' : (funnel?.attempted ?? 0)} color="secondary" />
        <StatCard icon="mark_email_read" label="Delivered" value={loading ? '...' : (funnel?.delivered ?? 0)} color="primary" />
        <StatCard icon="drafts" label="Opened" value={loading ? '...' : (funnel?.opened ?? 0)} color="primary" />
        <StatCard icon="touch_app" label="Clicked" value={loading ? '...' : (funnel?.clicked ?? 0)} color="primary" />
        <StatCard icon="error" label="Bounced" value={loading ? '...' : (funnel?.bounced ?? 0)} color={funnel?.bounced ? 'error' : 'secondary'} />
        <StatCard icon="report" label="Complained" value={loading ? '...' : (funnel?.complained ?? 0)} color={funnel?.complained ? 'error' : 'secondary'} />
      </div>

      {/* Rate KPIs — bottom row: health */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard
          icon="trending_up"
          label="Delivery rate"
          value={loading ? '...' : pct(rates?.deliveryRate ?? 0)}
          color="primary"
        />
        <StatCard
          icon="visibility"
          label="Open rate"
          value={loading ? '...' : pct(rates?.openRate ?? 0)}
          color="primary"
        />
        <StatCard
          icon="ads_click"
          label="Click rate"
          value={loading ? '...' : pct(rates?.clickRate ?? 0)}
          color="primary"
        />
        <StatCard
          icon="trending_down"
          label="CTR (clicks/opens)"
          value={loading ? '...' : pct(rates?.clickThroughRate ?? 0)}
          color="secondary"
        />
        <StatCard
          icon="error"
          label="Bounce rate"
          value={loading ? '...' : pct(rates?.bounceRate ?? 0)}
          color={warn?.bounceRateHigh ? 'error' : 'secondary'}
        />
        <StatCard
          icon="report"
          label="Complaint rate"
          value={loading ? '...' : pct(rates?.complaintRate ?? 0)}
          color={warn?.complaintRateHigh ? 'error' : 'secondary'}
        />
      </div>

      {/* Template Breakdown */}
      {stats?.byTemplate && Object.keys(stats.byTemplate).length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 mb-6">
          <h2 className="text-lg font-semibold text-on-surface mb-3">By Template</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(stats.byTemplate)
              .sort(([, a], [, b]) => b - a)
              .map(([template, count]) => {
                const perStatus = stats.byTemplateStatus?.[template] || {}
                const bounced = perStatus.bounced || 0
                const complained = perStatus.complained || 0
                const delivered =
                  (perStatus.delivered || 0) + (perStatus.opened || 0) + (perStatus.clicked || 0)
                const opened = (perStatus.opened || 0) + (perStatus.clicked || 0)
                return (
                  <div key={template} className="bg-surface-container rounded-lg p-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-sm font-medium text-on-surface">
                        {template.replace(/_/g, ' ')}
                      </p>
                      <p className="text-lg font-bold text-on-surface">{count}</p>
                    </div>
                    <div className="flex gap-2 text-xs text-on-surface/60 flex-wrap">
                      <span>delivered {delivered}</span>
                      <span>opened {opened}</span>
                      {bounced > 0 && <span className="text-red-600">bounced {bounced}</span>}
                      {complained > 0 && <span className="text-red-600">complained {complained}</span>}
                    </div>
                  </div>
                )
              })}
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
