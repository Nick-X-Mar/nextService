import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { sendEmail } from '@/utils/emailService'
import { logEvent } from '@/utils/eventLogger'
import { EventName, EmailTemplate } from '@/types/events'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkIpRateLimit = createRateLimiter('forgot-ip', 10, 3600000)
const checkEmailRateLimit = createRateLimiter('forgot-email', 3, 3600000)

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * POST /api/auth/forgot-password
 *
 * Body: { email: string, userType: 'client' | 'garage' }
 *
 * Always responds with success, even if the email does not exist. This
 * prevents account enumeration — an attacker cannot use this endpoint to
 * discover which emails are registered.
 *
 * If the email exists, generates a random token, stores its SHA-256 hash
 * and a 1-hour expiry on the user record, then emails the raw token back
 * to the user as part of a reset link.
 */
async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, userType = 'client' } = body || {}

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Το email είναι υποχρεωτικό' }, { status: 400 })
    }
    if (!['client', 'garage'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 })
    }

    const clientIP =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // Rate limit per IP and per email to make brute force / spam expensive.
    if (!checkIpRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }
    if (!checkEmailRateLimit(email)) {
      return NextResponse.json(
        { error: 'Πάρα πολλές αιτήσεις για αυτό το email. Δοκιμάστε ξανά σε 1 ώρα.' },
        { status: 429 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    // Both Clients and Garages carry an EmailIndex keyed on email, so this
    // resolves without reading the table.
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': normalizedEmail },
        Limit: 1
      })
    )
    const user = result.Items?.[0]

    // Generic success response — same regardless of whether the user exists.
    const genericSuccess = NextResponse.json({
      success: true,
      message: 'Αν το email αντιστοιχεί σε λογαριασμό, θα λάβεις σύνδεσμο επαναφοράς.'
    })

    if (!user) return genericSuccess

    // Generate a 32-byte random token. Store only its SHA-256 hash; send
    // the raw token to the user's email. When they click the link, we hash
    // what they give us and compare — this way a DB dump doesn't leak
    // actionable reset tokens.
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

    await dynamoDB.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: user.id },
        UpdateExpression:
          'SET passwordResetTokenHash = :h, passwordResetExpiresAt = :e, updatedAt = :u',
        ExpressionAttributeValues: {
          ':h': tokenHash,
          ':e': expiresAt,
          ':u': new Date().toISOString()
        }
      })
    )

    const resetUrl = `${APP_URL}/reset-password/${rawToken}?userType=${userType}`
    const displayName =
      userType === 'garage' ? user.companyName || '' : user.firstName || ''

    logEvent({
      eventName: EventName.PasswordResetRequested,
      actorType: userType === 'garage' ? 'garage' : 'client',
      actorId: user.id,
      ...(userType === 'client' ? { clientId: user.id } : { garageId: user.id }),
      source: 'api/auth/forgot-password',
      metadata: { email: normalizedEmail, expiresAt }
    })

    sendEmail({
      to: normalizedEmail,
      templateName: EmailTemplate.PasswordReset,
      variables: { resetUrl, displayName },
      triggerEvent: EventName.PasswordResetRequested,
      ...(userType === 'client' ? { clientId: user.id } : { garageId: user.id })
    })

    return genericSuccess
  } catch (err) {
    console.error('[forgot-password] error:', err)
    // Even on internal errors, be conservative: return generic success so
    // we don't expose timing/error differences. Log for ourselves though.
    return NextResponse.json({
      success: true,
      message: 'Αν το email αντιστοιχεί σε λογαριασμό, θα λάβεις σύνδεσμο επαναφοράς.'
    })
  }
}

export const POST = withMetrics(_POST)
