import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import { deleteSubscription, parseSubscription, saveSubscription, vapidPublicKey } from '@/utils/pushService'

const checkRate = createRateLimiter('push-subscriptions', 30, 3600000)

/** The key a browser subscribes with (`applicationServerKey`). */
async function _GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const publicKey = vapidPublicKey()
  if (!publicKey) {
    return NextResponse.json({ error: 'Οι ειδοποιήσεις δεν είναι διαθέσιμες' }, { status: 503 })
  }
  return NextResponse.json({ publicKey })
}

/**
 * This browser allowed notifications while signed in as this account
 * (src/lib/web-push-client.ts), so its push subscription is theirs now. Who
 * it is comes from the session, never the body. A pending garage may
 * subscribe too: the senders only notify active garages.
 */
async function _POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!checkRate(auth.userId)) {
    return NextResponse.json({ error: 'Πάρα πολλές αιτήσεις. Δοκιμάστε αργότερα.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) ?? {}
  const subscription = parseSubscription(body.subscription)
  if (!subscription) {
    return NextResponse.json({ error: 'Μη έγκυρη συσκευή' }, { status: 400 })
  }

  await saveSubscription(auth.userType, auth.userId, subscription)
  return NextResponse.json({ success: true })
}

/** Signing out, or turning notifications off: this browser stops getting the account's. */
async function _DELETE(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const body = (await request.json().catch(() => null)) ?? {}
  if (typeof body.endpoint !== 'string' || body.endpoint.length > 1024) {
    return NextResponse.json({ error: 'Μη έγκυρη συσκευή' }, { status: 400 })
  }

  await deleteSubscription(auth.userType, auth.userId, body.endpoint)
  return NextResponse.json({ success: true })
}

export const GET = withMetrics(_GET)
export const POST = withMetrics(_POST)
export const DELETE = withMetrics(_DELETE)
