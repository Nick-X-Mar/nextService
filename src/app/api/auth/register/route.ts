import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { hashPassword } from '@/utils/passwordService'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkRegisterRate = createRateLimiter('register', 3, 3600000)

// Bumped whenever the legal text changes — every signup record has the
// version it agreed to so we can prove what they accepted at the time.
const CURRENT_TERMS_VERSION = '1.0'

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, firstName, acceptedTerms } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Το email είναι υποχρεωτικό' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' }, { status: 400 })
    }

    if (acceptedTerms !== true) {
      return NextResponse.json(
        { error: 'Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου' },
        { status: 400 }
      )
    }

    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    if (!checkRegisterRate(clientIP)) {
      return NextResponse.json({ error: 'Πολλές εγγραφές. Δοκιμάστε ξανά σε 1 ώρα.' }, { status: 429 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if email already exists
    const existingResult = await dynamoDB.send(new ScanCommand({
      TableName: 'Clients',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail }
    }))

    if (existingResult.Items && existingResult.Items.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Υπάρχει ήδη λογαριασμός με αυτό το email',
        isExistingUser: true
      }, { status: 409 })
    }

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const passwordHash = await hashPassword(password)

    const nowIso = new Date().toISOString()
    const clientData = {
      id: clientId,
      firstName: firstName || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash,
      isActive: true,
      acceptedTermsAt: nowIso,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      createdAt: nowIso,
      updatedAt: nowIso
    }

    await dynamoDB.send(new PutCommand({
      TableName: 'Clients',
      Item: clientData
    }))

    logEvent({
      eventName: EventName.ClientRegistered,
      actorType: 'client',
      actorId: clientId,
      clientId,
      source: 'api/auth/register',
      metadata: { email: normalizedEmail }
    })

    const token = await signToken({ userId: clientData.id, userType: 'client' })
    const response = NextResponse.json({
      success: true,
      message: 'Εγγραφή επιτυχής',
      client: {
        id: clientData.id,
        firstName: clientData.firstName,
        email: clientData.email
      }
    })
    setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά την εγγραφή' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
