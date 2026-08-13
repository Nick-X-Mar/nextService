import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { hashPassword } from '@/utils/passwordService'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { createRateLimiter } from '@/utils/rateLimit'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { withMetrics } from '@/utils/withMetrics'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// The token is 32 random bytes, so guessing it is not realistic — but every
// attempt costs a full table scan, so an unlimited endpoint is a cheap way to
// burn read capacity. Limit by IP.
const resetRate = createRateLimiter('reset-password', 10, 10 * 60 * 1000)

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string, userType: 'client' | 'garage', newPassword: string }
 *
 * Validates the token against the stored SHA-256 hash, checks expiry,
 * sets the new password, and clears the reset fields so the token can't
 * be reused.
 */
async function _POST(request: NextRequest) {
  try {
    if (!resetRate(clientIp(request))) {
      return NextResponse.json(
        { error: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { token, userType = 'client', newPassword } = body || {}

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Λείπει το token επαναφοράς' }, { status: 400 })
    }
    if (!['client', 'garage'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες' },
        { status: 400 }
      )
    }

    const tableName = userType === 'garage' ? 'Garages' : 'Clients'
    const tokenHash = hashToken(token)

    // Find user by reset token hash. DynamoDB scan is fine here — password
    // reset is rare and we don't want to add a GSI just for this.
    const result = await dynamoDB.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'passwordResetTokenHash = :h',
        ExpressionAttributeValues: { ':h': tokenHash }
      })
    )
    const user = result.Items?.[0]

    if (!user) {
      return NextResponse.json(
        { error: 'Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί' },
        { status: 400 }
      )
    }

    const expiresAt = user.passwordResetExpiresAt
    if (!expiresAt || new Date(expiresAt as string).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Ο σύνδεσμος επαναφοράς έχει λήξει. Ζήτησε νέο.' },
        { status: 400 }
      )
    }

    const newHash = await hashPassword(newPassword)

    await dynamoDB.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: user.id },
        UpdateExpression:
          'SET passwordHash = :p, updatedAt = :u REMOVE passwordResetTokenHash, passwordResetExpiresAt',
        ExpressionAttributeValues: {
          ':p': newHash,
          ':u': new Date().toISOString()
        }
      })
    )

    logEvent({
      eventName: EventName.PasswordResetCompleted,
      actorType: userType === 'garage' ? 'garage' : 'client',
      actorId: user.id,
      ...(userType === 'client' ? { clientId: user.id } : { garageId: user.id }),
      source: 'api/auth/reset-password'
    })

    return NextResponse.json({
      success: true,
      message: 'Ο κωδικός σου ενημερώθηκε επιτυχώς. Μπορείς να συνδεθείς τώρα.'
    })
  } catch (err) {
    console.error('[reset-password] error:', err)
    return NextResponse.json(
      { error: 'Σφάλμα κατά την επαναφορά κωδικού' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
