'use client'

import { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'

interface DashboardStats {
  totalClients: number
  totalGarages: number
  activeGarages: number
  pendingGarages: number
  requestsByStatus: Record<string, number>
  emailsSent24h: number
  emailsFailed24h: number
  totalRequests: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/dashboard/stats')
        if (res.ok) {
          setStats(await res.json())
        }
      } catch {
        // silently fail — show empty state
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="people"
          label="Total Clients"
          value={stats?.totalClients ?? 0}
          color="primary"
        />
        <StatCard
          icon="garage"
          label="Total Garages"
          value={stats?.totalGarages ?? 0}
          color="secondary"
        />
        <StatCard
          icon="pending"
          label="Pending Approvals"
          value={stats?.pendingGarages ?? 0}
          color="tertiary"
        />
        <StatCard
          icon="build"
          label="Total Requests"
          value={stats?.totalRequests ?? 0}
          color="primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="check_circle"
          label="Active Garages"
          value={stats?.activeGarages ?? 0}
          color="primary"
        />
        <StatCard
          icon="mail"
          label="Emails Sent (24h)"
          value={stats?.emailsSent24h ?? 0}
          color="secondary"
        />
        <StatCard
          icon="error"
          label="Emails Failed (24h)"
          value={stats?.emailsFailed24h ?? 0}
          color="error"
        />
        <StatCard
          icon="schedule"
          label="Pending Requests"
          value={stats?.requestsByStatus?.['pending'] ?? 0}
          color="secondary"
        />
      </div>

      {/* Request Status Breakdown */}
      {stats?.requestsByStatus && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
          <h2 className="text-lg font-semibold text-on-surface mb-4">Requests by Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(stats.requestsByStatus).map(([status, count]) => (
              <div key={status} className="bg-surface-container rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-on-surface">{count}</p>
                <p className="text-xs text-on-surface/60 capitalize mt-1">{status.replace(/-/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
