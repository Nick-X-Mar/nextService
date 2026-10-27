import { NextRequest, NextResponse } from 'next/server'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { hashPassword } from '@/utils/passwordService'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'
import {
  GUEST_CONDITION,
  GUEST_PLACEHOLDER_NAME,
  PENDING_MERGE_FIELDS,
  clientIp,
  findClientByEmail,
  isConditionalCheckFailed,
  normalizeEmail,
  publicClient,
  requireGuestSession,
} from '../_lib/guestMerge'

const checkIpRate = createRateLimiter('register-requests', 10, 3600000)
const checkGuestRate = createRateLimiter('register-requests-guest', 10, 3600000)

const CURRENT_TERMS_VERSION = '1.0'

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

/**
 * POST /api/auth/register-from-requests
 *
 * Completes a guest's registration from the requests page. The guest is the
 * caller's own session; nothing in the body can point this at another row.
 *
 * When the email already belongs to an account this changes nothing and issues
 * no session — it answers `409 EMAIL_EXISTS`, and the page offers the two ways to
 * prove the account is theirs: its password
 * (`./merge-with-password`) or a link sent to that inbox (`./send-confirmation`).
 * This route used to merge into the existing account and sign the caller in as
 * its owner on the strength of the email address alone.
 */
async function _POST(request: NextRequest) {
  try {
    if (!checkIpRate(clientIp(request))) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες από αυτή τη διεύθυνση. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const session = await requireGuestSession(request, body?.guestClientId)
    if (session instanceof NextResponse) return session
    const { guestId } = session

    if (!checkGuestRate(guestId)) {
      return NextResponse.json(
        { error: 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const email = normalizeEmail(body?.email)
    if (!email) {
      return NextResponse.json({ error: 'Συμπληρώστε ένα έγκυρο email' }, { status: 400 })
    }

    if (await findClientByEmail(email)) {
      return NextResponse.json(
        { code: 'EMAIL_EXISTS', error: 'Υπάρχει ήδη λογαριασμός με αυτό το email.' },
        { status: 409 }
      )
    }

    const { password, acceptedTerms } = body
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες` },
        { status: 400 }
      )
    }
    if (acceptedTerms !== true) {
      return NextResponse.json(
        { error: 'Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου' },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password)

    // Hashing takes long enough for someone else to have registered the
    // address meanwhile, so look again immediately before the write.
    if (await findClientByEmail(email)) {
      return NextResponse.json(
        { code: 'EMAIL_EXISTS', error: 'Υπάρχει ήδη λογαριασμός με αυτό το email.' },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const names: Record<string, string> = { '#email': 'email' }
    const values: Record<string, unknown> = {
      ':email': email,
      ':passwordHash': passwordHash,
      ':termsAt': now,
      ':termsVersion': CURRENT_TERMS_VERSION,
      ':now': now,
    }
    const sets = [
      '#email = :email',
      'passwordHash = :passwordHash',
      'acceptedTermsAt = :termsAt',
      'acceptedTermsVersion = :termsVersion',
      'updatedAt = :now',
    ]
    // The name field is optional. Leaving it blank keeps whatever the guest
    // already had — this used to overwrite a real name with the email's local
    // part. A row still on the funnel's placeholder keeps the placeholder too:
    // the first name is what every garage sees before winning the job, and an
    // address's local part is often most of the address.
    const firstName = optionalText(body.firstName, 100)
    if (firstName) {
      sets.push('firstName = :firstName')
      values[':firstName'] = firstName
    } else {
      sets.push('firstName = if_not_exists(firstName, :placeholder)')
      values[':placeholder'] = GUEST_PLACEHOLDER_NAME
    }
    const lastName = optionalText(body.lastName, 100)
    if (lastName) {
      sets.push('lastName = :lastName')
      values[':lastName'] = lastName
    }
    const phoneNumber = optionalText(body.phoneNumber, 30)
    if (phoneNumber) {
      sets.push('phoneNumber = :phoneNumber')
      values[':phoneNumber'] = phoneNumber
    }

    let updated: Record<string, unknown> | undefined
    try {
      const result = await dynamoDB.send(
        new UpdateCommand({
          TableName: 'Clients',
          Key: { id: guestId },
          // A half-finished merge must not be overtaken by a registration.
          UpdateExpression: `SET ${sets.join(', ')} REMOVE ${PENDING_MERGE_FIELDS.join(', ')}`,
          ConditionExpression: `${GUEST_CONDITION} AND attribute_not_exists(mergingInto)`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      )
      updated = result.Attributes
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        return NextResponse.json(
          { code: 'NOT_GUEST', error: 'Ο λογαριασμός άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.' },
          { status: 409 }
        )
      }
      throw err
    }

    logEvent({
      eventName: EventName.GuestRegisteredFromRequest,
      actorType: 'client',
      actorId: guestId,
      clientId: guestId,
      source: 'api/auth/register-from-requests',
      metadata: { mergedToExisting: false },
    })

    return NextResponse.json({ success: true, client: publicClient(updated ?? { id: guestId }) })
  } catch (error) {
    console.error('[register-from-requests] error:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά την εγγραφή' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
