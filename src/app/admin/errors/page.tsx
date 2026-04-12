'use client'

import { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'

interface ErrorEntry {
  timestamp: string
  message: string
  logGroup: string
}

type TimeRange = '1h' | '6h' | '24h' | '7d'

export default function ErrorsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCount, setErrorCount] = useState({ total5xx: 0, total4xx: 0 })

  useEffect(() => {
    async function fetchErrors() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/errors/recent?range=${timeRange}`)
        if (res.ok) {
          const data = await res.json()
          setErrors(data.entries || [])
          setErrorCount({ total5xx: data.total5xx ?? 0, total4xx: data.total4xx ?? 0 })
        }
      } catch { /* empty */ }
      setLoading(false)
    }
    fetchErrors()
  }, [timeRange])

  const ranges: { value: TimeRange; label: string }[] = [
    { value: '1h', label: 'Last 1h' },
    { value: '6h', label: 'Last 6h' },
    { value: '24h', label: 'Last 24h' },
    { value: '7d', label: 'Last 7d' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Error Monitoring</h1>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon="error" label="5xx Errors" value={errorCount.total5xx} color="error" />
        <StatCard icon="warning" label="4xx Errors" value={errorCount.total4xx} color="tertiary" />
        <StatCard icon="bug_report" label="Total Entries" value={errors.length} color="secondary" />
      </div>

      {/* Error Log Viewer */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="px-5 py-3 border-b border-outline-variant/20">
          <h2 className="text-sm font-medium text-on-surface/70">Log Entries</h2>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : errors.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface/50">
            No errors found for this time range
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10 max-h-[600px] overflow-y-auto">
            {errors.map((entry, i) => (
              <div key={i} className="px-5 py-3 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-on-surface/50 font-mono">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span className="text-xs bg-surface-container-high text-on-surface/60 px-2 py-0.5 rounded">
                    {entry.logGroup}
                  </span>
                </div>
                <pre className="text-sm text-on-surface font-mono whitespace-pre-wrap break-words">
                  {entry.message}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
