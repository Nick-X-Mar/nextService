'use client'

import { useEffect, useState } from 'react'

interface ApiKeyHealth {
  apiId: string | null
  expiresAt: string | null
  daysRemaining: number | null
  severity: 'ok' | 'warning' | 'critical' | 'unknown'
  message: string
}

// Poll every 15 min — server-side caches for 5 min, so this is cheap and
// catches rotator runs without a page refresh.
const POLL_INTERVAL_MS = 15 * 60 * 1000

export default function SystemHealthBanner() {
  const [health, setHealth] = useState<ApiKeyHealth | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchHealth() {
      try {
        const res = await fetch('/api/admin/system/appsync-key/')
        if (!res.ok) return
        const data = (await res.json()) as ApiKeyHealth
        if (!cancelled) setHealth(data)
      } catch {
        /* silent — banner is non-critical chrome */
      }
    }

    fetchHealth()
    const id = setInterval(fetchHealth, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Only render when there's something to say. "ok" is silent.
  if (!health || health.severity === 'ok') return null

  const styles =
    health.severity === 'critical'
      ? 'bg-red-50 border-red-300 text-red-800'
      : health.severity === 'warning'
        ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
        : 'bg-neutral-50 border-neutral-300 text-neutral-700'

  const icon =
    health.severity === 'critical' ? '⚠' : health.severity === 'warning' ? '⏰' : 'ℹ'

  return (
    <div className={`border-b px-6 py-2 text-sm ${styles}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{icon} System health:</span>
        <span>{health.message}</span>
        {health.severity !== 'unknown' && (
          <span className="ml-auto text-xs opacity-70">
            Run <code className="bg-black/5 px-1 py-0.5 rounded">./cdk.sh deploy NextService-AppSync</code> to refresh
          </span>
        )}
      </div>
    </div>
  )
}
