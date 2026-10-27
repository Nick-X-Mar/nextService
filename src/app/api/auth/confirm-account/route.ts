import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import {
  MERGE_RETRY_CEILING_MS,
  claimGuestForMerge,
  clientIp,
  finalizeGuestMerge,
  getClient,
  isGuestRow,
  mergeGuestInto,
  mergeLinkIsUsable,
  mergeTokenMatches,
} from '../_lib/guestMerge'

const checkIpRate = createRateLimiter('confirm-account', 10, 10 * 60 * 1000)

function refusal(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status })
}

/**
 * POST /api/auth/confirm-account
 *
 * Body: { guestId, token } — both from the link in the confirmation email.
 *
 * Opening that link proves control of the account's inbox, which is the same
 * proof a password reset accepts, so this signs the browser that opened it
 * into the account. It is a POST behind a button rather than a GET on page
 * load: mail scanners prefetch links, and one of them must not spend the token
 * and receive the session.
 */
async function _POST(request: NextRequest) {
  try {
    if (!checkIpRate(clientIp(request))) {
      return refusal(429, 'RATE_LIMITED', 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο.')
    }

    const body = await request.json().catch(() => ({}))
    const guestId = typeof body?.guestId === 'string' ? body.guestId : ''
    const token = typeof body?.token === 'string' ? body.token : ''
    const invalid = () =>
      refusal(400, 'INVALID', 'Ο σύνδεσμος δεν είναι έγκυρος ή έχει αντικατασταθεί από νεότερο.')

    if (!guestId.startsWith('client-') || !/^[0-9a-f]{64}$/.test(token)) return invalid()

    const guest = await getClient(guestId)
    if (!guest) return invalid()

    if (guest.mergedInto) {
      return refusal(410, 'ALREADY_USED', 'Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί. Συνδεθείτε για να δείτε τα αιτήματά σας.')
    }
    if (!isGuestRow(guest) || !mergeTokenMatches(token, guest.mergeTokenHash)) return invalid()

    // Unopened: one hour. Opened in time but the merge broke off: it may be
    // opened again to finish, for a day — never indefinitely, since every
    // opening also hands this browser the account's session.
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    if (!mergeLinkIsUsable(guest, nowMs)) {
      return refusal(410, 'EXPIRED', 'Ο σύνδεσμος έχει λήξει. Ζητήστε νέο από τη σελίδα των αιτημάτων σας.')
    }

    const accountId = guest.mergeTargetId as string
    const account = accountId ? await getClient(accountId) : undefined
    // The link was mailed to an address, not to an id: if that account no
    // longer carries the address, whoever reads that inbox no longer owns it.
    if (!account || account.mergedInto || account.email !== guest.mergeEmail) {
      return refusal(409, 'ACCOUNT_CHANGED', 'Ο λογαριασμός άλλαξε από τότε που στάλθηκε το email. Ζητήστε νέο σύνδεσμο.')
    }

    // Consumes the token. Conditioned on the very hash presented, so a newer
    // link — or a concurrent registration — makes this one fail cleanly. The
    // window is re-checked in the write itself: a link confirmed in time may
    // finish an interrupted merge past the hour, up to the retry ceiling.
    const claimed = await claimGuestForMerge(guestId, accountId, {
      set: 'mergeConfirmedAt = if_not_exists(mergeConfirmedAt, :now)',
      condition:
        'mergeTokenHash = :hash AND mergeTargetId = :acct AND (mergeConfirmedAt > :retryFloor OR (attribute_not_exists(mergeConfirmedAt) AND mergeExpiresAt > :now))',
      values: {
        ':hash': guest.mergeTokenHash,
        ':now': now,
        ':retryFloor': new Date(nowMs - MERGE_RETRY_CEILING_MS).toISOString(),
      },
    })
    if (!claimed) {
      const latest = await getClient(guestId)
      if (latest?.mergedInto) {
        return refusal(410, 'ALREADY_USED', 'Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί. Συνδεθείτε για να δείτε τα αιτήματά σας.')
      }
      return invalid()
    }

    const summary = await mergeGuestInto(guestId, accountId)
    if (!(await finalizeGuestMerge(guestId, accountId))) {
      return refusal(409, 'MERGE_CONFLICT', 'Η σύνδεση των αιτημάτων δεν ολοκληρώθηκε. Δοκιμάστε ξανά.')
    }

    logEvent({
      eventName: EventName.GuestMergedIntoAccount,
      actorType: 'client',
      actorId: accountId,
      clientId: accountId,
      source: 'api/auth/confirm-account',
      metadata: { guestClientId: guestId, method: 'email', ...summary },
    })

    const response = NextResponse.json({ success: true, clientId: accountId })
    setAuthCookie(response, await signToken({ userId: accountId, userType: 'client' }))
    return response
  } catch (error) {
    console.error('[confirm-account] error:', error)
    return NextResponse.json(
      { success: false, error: 'Σφάλμα κατά την επιβεβαίωση. Δοκιμάστε ξανά.' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
