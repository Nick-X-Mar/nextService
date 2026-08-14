'use client'

import { useState, useEffect, useCallback } from 'react'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area,
} from 'recharts'

interface EndpointStat {
  endpoint: string
  method: string
  count: number
  p50: number
  p95: number
  p99: number
  avg: number
  errorCount: number
  errorRate: number
}

interface TimeBucket {
  time: string
  count: number
  errorCount: number
  avgResponseTime: number
}

interface ErrorBucket {
  time: string
  errorRate: number
  errorCount: number
  totalCount: number
}

interface HistogramBucket {
  bucket: string
  count: number
}

interface Summary {
  totalRequests: number
  totalErrors: number
  errorRate: number
  p50: number
  p95: number
  p99: number
  avg: number
}

interface MetricsData {
  summary: Summary
  endpointStats: EndpointStat[]
  top10Slow: EndpointStat[]
  volumeOverTime: TimeBucket[]
  errorOverTime: ErrorBucket[]
  histogram: HistogramBucket[]
  range: string
}

const RANGES = [
  { key: '1h', label: '1 ώρα' },
  { key: '6h', label: '6 ώρες' },
  { key: '24h', label: '24 ώρες' },
  { key: '7d', label: '7 ημέρες' },
]

function formatTime(iso: string, range: string): string {
  const d = new Date(iso)
  if (range === '7d') return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
      <p className="text-xs text-secondary font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
      {sub && <p className="text-xs text-secondary mt-0.5">{sub}</p>}
    </div>
  )
}

export default function PerformanceCharts() {
  const [range, setRange] = useState('24h')
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { run, isPending } = useAsyncTask()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/performance/metrics/?range=${range}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-secondary py-10 text-center">Δεν βρέθηκαν δεδομένα</p>
  }

  const { summary, top10Slow, volumeOverTime, errorOverTime, histogram, endpointStats } = data

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              range === r.key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-secondary">Auto-refresh</label>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`w-10 h-5 rounded-full transition-colors relative ${autoRefresh ? 'bg-primary' : 'bg-outline-variant'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? 'left-5' : 'left-0.5'}`} />
          </button>
          <button
            onClick={() => run(fetchData)}
            disabled={isPending()}
            aria-label="Ανανέωση"
            className="ml-2 p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            {isPending()
              ? <Spinner size="md" className="text-secondary" />
              : <span className="material-symbols-outlined text-[18px] text-secondary">refresh</span>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Συνολικά Requests" value={summary.totalRequests.toLocaleString('el-GR')} />
        <StatCard label="Errors" value={summary.totalErrors} sub={`${(summary.errorRate * 100).toFixed(1)}%`} />
        <StatCard label="p50 Latency" value={`${summary.p50}ms`} />
        <StatCard label="p95 Latency" value={`${summary.p95}ms`} />
        <StatCard label="p99 Latency" value={`${summary.p99}ms`} />
        <StatCard label="Avg Latency" value={`${summary.avg}ms`} />
      </div>

      {/* Request volume over time */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
        <h3 className="font-bold text-on-surface mb-4">Request Volume</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={volumeOverTime}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant, #ccc)" opacity={0.3} />
            <XAxis dataKey="time" tickFormatter={(v) => formatTime(v, range)} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString('el-GR')}
              contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="count" stroke="#6750A4" fill="#6750A4" fillOpacity={0.15} name="Requests" />
            <Area type="monotone" dataKey="errorCount" stroke="#B3261E" fill="#B3261E" fillOpacity={0.15} name="Errors" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two charts side by side */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Latency histogram */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
          <h3 className="font-bold text-on-surface mb-4">Latency Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={histogram}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant, #ccc)" opacity={0.3} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 12 }} />
              <Bar dataKey="count" fill="#6750A4" radius={[4, 4, 0, 0]} name="Requests" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Error rate trend */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
          <h3 className="font-bold text-on-surface mb-4">Error Rate Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={errorOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant, #ccc)" opacity={0.3} />
              <XAxis dataKey="time" tickFormatter={(v) => formatTime(v, range)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={(v) => new Date(v as string).toLocaleString('el-GR')}
                formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, 'Error Rate']}
                contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="errorRate" stroke="#B3261E" strokeWidth={2} dot={false} name="Error Rate" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* p50/p95/p99 bar chart per endpoint */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6">
        <h3 className="font-bold text-on-surface mb-4">Response Times ανά Endpoint (Top 10 Slowest)</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, top10Slow.length * 40)}>
          <BarChart data={top10Slow} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--md-sys-color-outline-variant, #ccc)" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 11 }} unit="ms" />
            <YAxis
              dataKey="endpoint"
              type="category"
              width={220}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: string) => {
                const short = v.replace('/api/', '')
                return short.length > 30 ? short.slice(0, 30) + '…' : short
              }}
            />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 12 }} />
            <Legend />
            <Bar dataKey="p50" fill="#94D2BD" name="p50" radius={[0, 2, 2, 0]} />
            <Bar dataKey="p95" fill="#E9D8A6" name="p95" radius={[0, 2, 2, 0]} />
            <Bar dataKey="p99" fill="#EE9B00" name="p99" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Endpoint table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h3 className="font-bold text-on-surface">Όλα τα Endpoints</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 bg-surface-container">
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-secondary">Method</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">Requests</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">Avg</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">p50</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">p95</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">p99</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">Errors</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-secondary">Error Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {[...endpointStats]
                .sort((a, b) => b.count - a.count)
                .map((ep, i) => (
                <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-on-surface">{ep.endpoint}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      ep.method === 'GET' ? 'bg-green-100 text-green-700' :
                      ep.method === 'POST' ? 'bg-blue-100 text-blue-700' :
                      ep.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
                      ep.method === 'DELETE' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{ep.method}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface">{ep.count}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{ep.avg}ms</td>
                  <td className="px-4 py-3 text-right text-on-surface">{ep.p50}ms</td>
                  <td className="px-4 py-3 text-right text-on-surface font-medium">{ep.p95}ms</td>
                  <td className="px-4 py-3 text-right text-on-surface">{ep.p99}ms</td>
                  <td className="px-4 py-3 text-right text-on-surface">{ep.errorCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-medium ${ep.errorRate > 0.1 ? 'text-red-600' : ep.errorRate > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {(ep.errorRate * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {endpointStats.length === 0 && (
          <p className="px-6 py-8 text-center text-secondary text-sm">Δεν υπάρχουν δεδομένα για αυτό το χρονικό διάστημα</p>
        )}
      </div>
    </div>
  )
}
