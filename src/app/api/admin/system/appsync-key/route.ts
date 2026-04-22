import { NextRequest, NextResponse } from 'next/server'
import { AppSyncClient, ListApiKeysCommand } from '@aws-sdk/client-appsync'
import { getAdminFromRequest } from '@/utils/adminAuth'
import { withMetrics } from '@/utils/withMetrics'

// Health check for the AppSync API key used by the chat WebSocket. Reports
// the earliest expiration among all keys on the API so the admin UI can
// surface a banner when renewal is approaching. A rotator Lambda normally
// extends `expires` every ~10 months, so the answer should nearly always be
// "critical > 300 days". If it drops below the thresholds, something is
// wrong with the rotator.

const REGION = process.env.SES_REGION || process.env.REGION || 'eu-central-1'

// Thresholds for banner severity. Below `critical`, the banner is red and
// the admin needs to redeploy urgently (the rotator has likely failed for
// more than two cycles).
const WARNING_DAYS = 60
const CRITICAL_DAYS = 30

// Module-level cache so we're not calling AppSync on every page navigation.
// Expiration changes once per ~10 months; 5 minutes of stale is fine.
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { at: number; payload: ApiKeyHealth } | null = null

interface ApiKeyHealth {
  apiId: string | null
  expiresAt: string | null  // ISO
  daysRemaining: number | null
  severity: 'ok' | 'warning' | 'critical' | 'unknown'
  message: string
}

let sharedClient: AppSyncClient | null = null
function getClient(): AppSyncClient {
  if (!sharedClient) sharedClient = new AppSyncClient({ region: REGION })
  return sharedClient
}

function extractApiIdFromEndpoint(): string | null {
  // The SSR runtime gets the same NEXT_PUBLIC_* vars as the client. The
  // endpoint looks like `{apiId}.appsync-api.{region}.amazonaws.com`.
  const endpoint = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT || ''
  const host = endpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const m = host.match(/^([^.]+)\.appsync-api\./)
  return m ? m[1] : null
}

async function computeHealth(): Promise<ApiKeyHealth> {
  const apiId = extractApiIdFromEndpoint()
  if (!apiId) {
    return {
      apiId: null,
      expiresAt: null,
      daysRemaining: null,
      severity: 'unknown',
      message: 'AppSync endpoint env var not set — cannot determine expiration.'
    }
  }

  const res = await getClient().send(new ListApiKeysCommand({ apiId }))
  const keys = res.apiKeys || []
  if (keys.length === 0) {
    return {
      apiId,
      expiresAt: null,
      daysRemaining: null,
      severity: 'critical',
      message: 'No API keys found on the AppSync API.'
    }
  }

  // Pick the soonest-expiring key — worst case wins, since any of them
  // expiring means some clients will break.
  const soonest = keys.reduce((min, k) => {
    if (!k.expires) return min
    if (!min?.expires) return k
    return k.expires < min.expires ? k : min
  })

  const expiresSec = soonest.expires || 0
  const nowSec = Math.floor(Date.now() / 1000)
  const daysRemaining = Math.max(0, Math.floor((expiresSec - nowSec) / 86400))
  const expiresAt = new Date(expiresSec * 1000).toISOString()

  let severity: ApiKeyHealth['severity']
  let message: string
  if (daysRemaining <= CRITICAL_DAYS) {
    severity = 'critical'
    message = `AppSync key expires in ${daysRemaining} days — redeploy AppSync immediately or chat will break for everyone.`
  } else if (daysRemaining <= WARNING_DAYS) {
    severity = 'warning'
    message = `AppSync key expires in ${daysRemaining} days — the auto-rotator may have failed. Check CloudWatch logs and consider a redeploy.`
  } else {
    severity = 'ok'
    message = `AppSync key valid for ${daysRemaining} more days.`
  }

  return { apiId, expiresAt, daysRemaining, severity, message }
}

async function _GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload)
  }

  try {
    const payload = await computeHealth()
    cache = { at: now, payload }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('AppSync key health check failed:', err)
    return NextResponse.json(
      {
        apiId: null,
        expiresAt: null,
        daysRemaining: null,
        severity: 'unknown',
        message: 'Health check failed — see server logs.'
      } satisfies ApiKeyHealth,
      { status: 200 }
    )
  }
}

export const GET = withMetrics(_GET)
