'use client'

import dynamic from 'next/dynamic'

const PerformanceCharts = dynamic(
  () => import('./components/PerformanceCharts'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

export default function PerformancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Performance KPIs</h1>
        <p className="text-sm text-secondary mt-1">Metrics και latency ανά API endpoint</p>
      </div>
      <PerformanceCharts />
    </div>
  )
}
