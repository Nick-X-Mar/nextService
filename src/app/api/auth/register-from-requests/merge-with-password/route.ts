import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { verifyPassword } from '@/utils/passwordService'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import {
  claimGuestForMerge,
  clientIp,
  finalizeGuestMerge,
  findClientByEmail,
  mergeGuestInto,
  normalizeEmail,
  publicClient,
  requireGuestSession,
} from '../../_lib/guestMerge'

// The same buckets /api/auth/login draws from: this is a password check
// against someone's account, and a second endpoint with its own allowance would
// simply double an attacker's guesses.
const checkIpRate = createRateLimiter('login-ip', 10, 3600000)
const checkEmailRate = createRateLimiter('login-email', 5, 3600000)

/**
 * POST /api/auth/register-from-requests/merge-with-password
 *
 * Body: { email, password }
 *
 * The guest proves it owns an existing account by that account's password;
 * only then do its requests and vehicles move across and the session switch
 * to the account.
 */
async function _POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const session = await requireGuestSession(request, body?.guestClientId)
    if (session instanceof NextResponse) return session
    const { guestId } = session

    const email = normalizeEmail(body?.email)
    const password = body?.password
    if (!email || typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Συμπληρώστε email και κωδικό' }, { status: 400 })
    }

    if (!checkIpRate(clientIp(request))) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }
    if (!checkEmailRate(email)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες για αυτό το email. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const account = await findClientByEmail(email)
    const valid =
      !!account &&
      typeof account.passwordHash === 'string' &&
      !account.mergedInto &&
      (await verifyPassword(password, account.passwordHash))
    if (!account || !valid) {
      return NextResponse.json({ error: 'Λάθος κωδικός πρόσβασης' }, { status: 401 })
    }
    const accountId = account.id as string

    if (!(await claimGuestForMerge(guestId, accountId))) {
      return NextResponse.json(
        {
          code: 'MERGE_IN_PROGRESS',
          error: 'Τα αιτήματα συνδέονται ήδη με άλλον λογαριασμό. Ανανεώστε τη σελίδα.',
        },
        { status: 409 }
      )
    }

    const summary = await mergeGuestInto(guestId, accountId)
    if (!(await finalizeGuestMerge(guestId, accountId))) {
      return NextResponse.json(
        { code: 'MERGE_CONFLICT', error: 'Η σύνδεση των αιτημάτων δεν ολοκληρώθηκε. Δοκιμάστε ξανά.' },
        { status: 409 }
      )
    }

    logEvent({
      eventName: EventName.GuestMergedIntoAccount,
      actorType: 'client',
      actorId: accountId,
      clientId: accountId,
      source: 'api/auth/register-from-requests/merge-with-password',
      metadata: { guestClientId: guestId, method: 'password', ...summary },
    })

    const response = NextResponse.json({
      success: true,
      client: publicClient(account),
      vehicleDeduplicated: summary.vehiclesDeduplicated > 0,
    })
    setAuthCookie(response, await signToken({ userId: accountId, userType: 'client' }))
    return response
  } catch (error) {
    console.error('[merge-with-password] error:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά τη σύνδεση των αιτημάτων' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
