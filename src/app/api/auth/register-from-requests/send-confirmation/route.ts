import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { sendEmail } from '@/utils/emailService'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import {
  GUEST_CONDITION,
  MERGE_CLAIM_STALE_MS,
  MERGE_TOKEN_TTL_MS,
  clientIp,
  findClientByEmail,
  getClient,
  hashMergeToken,
  isConditionalCheckFailed,
  mergeClaimIsFresh,
  normalizeEmail,
  requireGuestSession,
} from '../../_lib/guestMerge'

// The recipient is someone else's inbox until proven otherwise, so re-sends are
// capped from every direction: per guest, per target address and per IP. The
// in-memory limits are per instance; the DB cooldown below holds across them.
const checkGuestRate = createRateLimiter('merge-email-guest', 3, 3600000)
const checkEmailRate = createRateLimiter('merge-email-target', 3, 3600000)
const checkIpRate = createRateLimiter('merge-email-ip', 10, 3600000)
const RESEND_COOLDOWN_MS = 60 * 1000

/**
 * Why no link can be sent while a merge holds the guest, or null when none
 * does. A merge into another account owns the requests now. One into this
 * same account that started moments ago is still moving them, and answering
 * that with the re-send cooldown — as this used to, for as long as the claim
 * stood — sent the user round in circles; once the claim has gone stale the
 * merge is dead, and a fresh link is allowed so it can be finished.
 */
function mergeRefusal(guest: Record<string, unknown>, accountId: string): NextResponse | null {
  if (!guest.mergingInto) return null
  if (guest.mergingInto !== accountId) {
    return NextResponse.json(
      {
        code: 'MERGE_IN_PROGRESS',
        error: 'Τα αιτήματα συνδέονται ήδη με άλλον λογαριασμό. Ανανεώστε τη σελίδα.',
      },
      { status: 409 }
    )
  }
  if (mergeClaimIsFresh(guest)) {
    return NextResponse.json(
      {
        code: 'MERGE_RUNNING',
        error: 'Η μεταφορά των αιτημάτων στον λογαριασμό σας βρίσκεται σε εξέλιξη. Περιμένετε λίγο — η σελίδα θα ενημερωθεί μόλις ολοκληρωθεί.',
      },
      { status: 409 }
    )
  }
  return null
}

/**
 * POST /api/auth/register-from-requests/send-confirmation
 *
 * Body: { email }
 *
 * Mails the owner of an existing account a single-use, one-hour link that
 * folds the caller's guest requests into that account. Nothing changes until
 * the link is opened (`/api/auth/confirm-account`); the pending merge waits on
 * the guest row, and only the token's hash is stored.
 */
async function _POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const session = await requireGuestSession(request, body?.guestClientId)
    if (session instanceof NextResponse) return session
    const { guestId, guest } = session

    const email = normalizeEmail(body?.email)
    if (!email) {
      return NextResponse.json({ error: 'Συμπληρώστε ένα έγκυρο email' }, { status: 400 })
    }

    const tooMany = NextResponse.json(
      { error: 'Στείλαμε ήδη αρκετά email. Δοκιμάστε ξανά σε 1 ώρα.' },
      { status: 429 }
    )
    if (!checkIpRate(clientIp(request)) || !checkGuestRate(guestId) || !checkEmailRate(email)) {
      return tooMany
    }

    const account = await findClientByEmail(email)
    if (!account || account.mergedInto) {
      return NextResponse.json(
        { code: 'EMAIL_AVAILABLE', error: 'Δεν υπάρχει λογαριασμός με αυτό το email.' },
        { status: 409 }
      )
    }
    const accountId = account.id as string

    const busy = mergeRefusal(guest, accountId)
    if (busy) return busy

    // 32 random bytes, of which only the SHA-256 is stored — the same scheme as
    // password reset, so a leaked table holds nothing that opens the link.
    const rawToken = randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = new Date(now + MERGE_TOKEN_TTL_MS).toISOString()

    try {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: 'Clients',
          Key: { id: guestId },
          // A new link replaces the previous one, which stops working.
          UpdateExpression:
            'SET mergeTokenHash = :hash, mergeTargetId = :acct, mergeEmail = :email, mergeExpiresAt = :exp, mergeRequestedAt = :now REMOVE mergeConfirmedAt',
          // Unclaimed, or claimed for this very account by a merge that died
          // (see mergeRefusal) — the new link is how that one gets finished.
          ConditionExpression: `${GUEST_CONDITION} AND (attribute_not_exists(mergingInto) OR (mergingInto = :acct AND (attribute_not_exists(mergeClaimedAt) OR mergeClaimedAt < :stale))) AND (attribute_not_exists(mergeRequestedAt) OR mergeRequestedAt < :cooldown)`,
          ExpressionAttributeValues: {
            ':hash': hashMergeToken(rawToken),
            ':acct': accountId,
            ':email': email,
            ':exp': expiresAt,
            ':now': new Date(now).toISOString(),
            ':stale': new Date(now - MERGE_CLAIM_STALE_MS).toISOString(),
            ':cooldown': new Date(now - RESEND_COOLDOWN_MS).toISOString(),
          },
        })
      )
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        // A merge may have been claimed since the row was read; only when
        // none is in the way is this really the re-send cooldown.
        const latest = await getClient(guestId)
        if (latest?.mergedInto) {
          return NextResponse.json(
            {
              code: 'ALREADY_MERGED',
              error: 'Τα αιτήματα αυτά έχουν ήδη συνδεθεί με λογαριασμό. Συνδεθείτε για να τα δείτε.',
            },
            { status: 409 }
          )
        }
        const raced = latest && mergeRefusal(latest, accountId)
        if (raced) return raced
        return NextResponse.json(
          { code: 'RESEND_COOLDOWN', error: 'Μόλις στείλαμε email. Περιμένετε ένα λεπτό πριν ζητήσετε νέο.' },
          { status: 429 }
        )
      }
      throw err
    }

    // A path: the template puts SITE_URL in front of every link it sends.
    const confirmPath = `/confirm-account/?g=${encodeURIComponent(guestId)}&t=${rawToken}`

    await logEvent({
      eventName: EventName.GuestMergeRequested,
      actorType: 'client',
      actorId: guestId,
      clientId: guestId,
      source: 'api/auth/register-from-requests/send-confirmation',
      metadata: { targetClientId: accountId, expiresAt },
    })

    await sendEmail({
      to: account.email as string,
      templateName: EmailTemplate.AccountMergeConfirmation,
      variables: { confirmPath },
      triggerEvent: EventName.GuestMergeRequested,
      clientId: accountId,
    })

    return NextResponse.json({ success: true, expiresAt })
  } catch (error) {
    console.error('[send-confirmation] error:', error)
    return NextResponse.json({ error: 'Δεν ήταν δυνατή η αποστολή του email' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
