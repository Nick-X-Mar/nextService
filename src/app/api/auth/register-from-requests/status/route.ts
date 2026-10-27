import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from '@/utils/requireAuth'
import { withMetrics } from '@/utils/withMetrics'
import { getClient, isGuestRow, mergeClaimIsFresh, mergeLinkIsUsable } from '../../_lib/guestMerge'

/**
 * GET /api/auth/register-from-requests/status
 *
 * Polled by the requests tab that is waiting for its confirmation link to be
 * opened — possibly on another device. Answers for the caller's own guest row
 * only, and with nothing beyond the state: not the account, not the address.
 *
 * `403 NOT_GUEST` is how the waiting tab learns the link was opened in this
 * same browser: confirming swaps the session cookie to the account, so the
 * next poll arrives signed in as a registered client.
 */
async function _GET(request: NextRequest) {
  const auth = getAuth(request)
  if (!auth || auth.userType !== 'client') {
    return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  }

  try {
    const row = await getClient(auth.userId)
    if (!row) {
      return NextResponse.json({ error: 'Ο λογαριασμός δεν βρέθηκε' }, { status: 404 })
    }
    if (row.mergedInto) {
      return NextResponse.json({ status: 'merged' })
    }
    if (!isGuestRow(row)) {
      return NextResponse.json({ code: 'NOT_GUEST', error: 'Δεν είστε επισκέπτης' }, { status: 403 })
    }
    // A merge moving the requests right now is pending whichever way it began.
    if (mergeClaimIsFresh(row)) {
      return NextResponse.json({ status: 'pending' })
    }
    if (!row.mergeTokenHash) {
      return NextResponse.json({ status: 'none' })
    }
    // A link opened in time but not finished stays pending until the retry
    // ceiling; after that the page offers a new one, which can finish it.
    return NextResponse.json({ status: mergeLinkIsUsable(row) ? 'pending' : 'expired' })
  } catch (error) {
    console.error('[register-from-requests/status] error:', error)
    return NextResponse.json({ error: 'Σφάλμα' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
