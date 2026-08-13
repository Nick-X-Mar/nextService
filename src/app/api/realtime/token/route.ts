import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

/**
 * Issues a short-lived token the browser can hand to AppSync.
 *
 * Why this exists: the session cookie is httpOnly, so client JavaScript cannot
 * read it to put in the AppSync `Authorization` header. Rather than weaken the
 * cookie, the browser calls this authenticated endpoint and holds the returned
 * token in memory only.
 *
 * Signed with REALTIME_JWT_SECRET, deliberately NOT the session secret. If the
 * two shared a key, a realtime token — which is handed to a third-party service
 * and lives in browser memory — could be replayed as a session cookie and would
 * authenticate every REST route.
 */
const TTL_SECONDS = 15 * 60

const checkRate = createRateLimiter('realtime-token', 60, 10 * 60 * 1000)

function getSecret(): Uint8Array {
  const key = process.env.REALTIME_JWT_SECRET
  if (!key) {
    throw new Error('REALTIME_JWT_SECRET env var is not set — refusing to sign realtime tokens')
  }
  return new TextEncoder().encode(key)
}

async function _GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    if (!checkRate(auth.userId)) {
      return NextResponse.json(
        { error: 'Πάρα πολλά αιτήματα. Δοκιμάστε ξανά σε λίγο.' },
        { status: 429 }
      )
    }

    const token = await new SignJWT({ userId: auth.userId, userType: auth.userType })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('appsync-events')
      .setExpirationTime(`${TTL_SECONDS}s`)
      .sign(getSecret())

    return NextResponse.json({
      token,
      expiresIn: TTL_SECONDS,
    })
  } catch (error) {
    console.error('[realtime/token] error:', error)
    return NextResponse.json({ error: 'Σφάλμα έκδοσης token' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
