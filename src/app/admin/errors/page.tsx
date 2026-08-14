'use client'

import { useCallback, useEffect, useState } from 'react'
import StatCard from '../components/StatCard'
import Spinner from '@/components/Spinner'
import ExportModal from './components/ExportModal'
import ImportModal from './components/ImportModal'

type TimeRange = '1h' | '6h' | '24h' | '7d'
type StatusFilter = 'open' | 'resolved' | 'ignored' | 'all'
type ErrorStatus = 'open' | 'resolved' | 'ignored'

interface ErrorGroup {
  fingerprint: string
  count: number
  firstSeen: string
  lastSeen: string
  logGroup: string
  sampleMessage: string
  status: ErrorStatus
  notes?: string
  resolvedAt?: string
  resolvedBy?: string
}

interface RecentResponse {
  groups: ErrorGroup[]
  total5xx: number
  total4xx: number
  totalEntries: number
  totalGroups: number
}

const ranges: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1h' },
  { value: '6h', label: 'Last 6h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' }
]

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Ανοιχτά' },
  { value: 'resolved', label: 'Λυμένα' },
  { value: 'ignored', label: 'Αγνοημένα' },
  { value: 'all', label: 'Όλα' }
]

function statusBadgeClasses(status: ErrorStatus): string {
  switch (status) {
    case 'resolved':
      return 'bg-green-100 text-green-700'
    case 'ignored':
      return 'bg-surface-container-high text-on-surface/60'
    case 'open':
    default:
      return 'bg-error-container/40 text-on-error-container'
  }
}

function shortTitle(message: string, max = 120): string {
  const first = message.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}

export default function ErrorsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [data, setData] = useState<RecentResponse>({
    groups: [],
    total5xx: 0,
    total4xx: 0,
    totalEntries: 0,
    totalGroups: 0
  })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actingFp, setActingFp] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchErrors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/errors/recent/?range=${timeRange}&status=${statusFilter}`
      )
      if (res.ok) {
        const body = (await res.json()) as RecentResponse
        setData(body)
      }
    } catch {
      // ignored — empty state
    } finally {
      setLoading(false)
    }
  }, [timeRange, statusFilter])

  useEffect(() => {
    fetchErrors()
  }, [fetchErrors, refreshKey])

  const updateStatus = async (group: ErrorGroup, next: ErrorStatus) => {
    setActingFp(group.fingerprint)
    try {
      if (next === 'open') {
        await fetch(`/api/admin/errors/resolutions/${group.fingerprint}/`, {
          method: 'DELETE'
        })
      } else {
        await fetch(`/api/admin/errors/resolutions/${group.fingerprint}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: next,
            sampleMessage: group.sampleMessage,
            logGroup: group.logGroup
          })
        })
      }
      setRefreshKey((k) => k + 1)
    } finally {
      setActingFp(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Error Monitoring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary hover:opacity-90 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            Export για Claude
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-container-high text-on-surface hover:bg-surface-container-highest flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">file_upload</span>
            Import resolutions
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {statusFilters.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface/70 hover:bg-surface-container-highest'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setTimeRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                timeRange === r.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface/70 hover:bg-surface-container-highest'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon="error" label="5xx Errors" value={data.total5xx} color="error" />
        <StatCard icon="warning" label="4xx Errors" value={data.total4xx} color="tertiary" />
        <StatCard icon="bug_report" label="Total Entries" value={data.totalEntries} color="secondary" />
        <StatCard icon="fingerprint" label="Unique" value={data.totalGroups} color="primary" />
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-sm font-medium text-on-surface/70">Grouped Errors</h2>
          <span className="text-xs text-on-surface/50">
            {data.groups.length} group{data.groups.length === 1 ? '' : 's'} shown
          </span>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : data.groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface/50">
            Δεν βρέθηκαν errors για αυτό το φίλτρο.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10 max-h-[70vh] overflow-y-auto">
            {data.groups.map((g) => {
              const isOpen = expanded === g.fingerprint
              const acting = actingFp === g.fingerprint
              return (
                <div key={g.fingerprint}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : g.fingerprint)}
                    className="w-full text-left px-5 py-3 hover:bg-surface-container-low transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="text-xs font-mono font-bold text-on-surface bg-surface-container-high px-2 py-0.5 rounded">
                        {g.fingerprint}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${statusBadgeClasses(g.status)}`}
                      >
                        {g.status}
                      </span>
                      <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded">
                        ×{g.count}
                      </span>
                      <span className="text-xs text-on-surface/50 font-mono">
                        last {new Date(g.lastSeen).toLocaleString()}
                      </span>
                      <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded ml-auto">
                        {g.logGroup}
                      </span>
                    </div>
                    <div className="text-sm text-on-surface font-mono truncate">
                      {shortTitle(g.sampleMessage, 200)}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 bg-surface-container-low/50">
                      <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-words bg-surface-container rounded-lg border border-outline-variant/20 p-3 max-h-[40vh] overflow-auto">
                        {g.sampleMessage}
                      </pre>
                      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                        <div className="text-xs text-on-surface/60">
                          First seen: {new Date(g.firstSeen).toLocaleString()}
                          {g.notes && (
                            <>
                              <span className="mx-2">•</span>
                              <span>Notes: {g.notes}</span>
                            </>
                          )}
                          {g.resolvedAt && (
                            <>
                              <span className="mx-2">•</span>
                              <span>Resolved: {new Date(g.resolvedAt).toLocaleString()}</span>
                              {g.resolvedBy && <span> ({g.resolvedBy})</span>}
                            </>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {g.status !== 'resolved' && (
                            <button
                              disabled={acting}
                              onClick={() => updateStatus(g, 'resolved')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {acting && <Spinner size="sm" />}
                              Mark resolved
                            </button>
                          )}
                          {g.status !== 'ignored' && (
                            <button
                              disabled={acting}
                              onClick={() => updateStatus(g, 'ignored')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:opacity-50"
                            >
                              {acting && <Spinner size="sm" />}
                              Mark ignored
                            </button>
                          )}
                          {g.status !== 'open' && (
                            <button
                              disabled={acting}
                              onClick={() => updateStatus(g, 'open')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-on-primary hover:opacity-90 disabled:opacity-50"
                            >
                              {acting && <Spinner size="sm" />}
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        range={timeRange}
        status={statusFilter}
      />
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onApplied={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
