import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyPassword } from '@/utils/passwordService'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

/** The fields this route reads off a Clients/Garages record. */
interface AuthUser {
  id: string
  email?: string
  passwordHash?: string
  isActive?: boolean
  companyName?: string
  mobile?: string
  address?: string
  tin?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
}

const checkIPRate = createRateLimiter('login-ip', 10, 3600000)
const checkEmailRate = createRateLimiter('login-email', 5, 3600000)

async function _POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, userType = 'client' } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Το email είναι υποχρεωτικό' }, { status: 400 })
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Ο κωδικός είναι υποχρεωτικός' }, { status: 400 })
    }

    if (!['client', 'garage'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 400 })
    }

    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    if (!checkIPRate(clientIP)) {
      return NextResponse.json({
        error: 'Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε 1 ώρα.'
      }, { status: 429 })
    }

    if (!checkEmailRate(email)) {
      return NextResponse.json({
        error: 'Πολλές προσπάθειες για αυτό το email. Δοκιμάστε ξανά σε 1 ώρα.'
      }, { status: 429 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Both tables have an EmailIndex, so neither login path scans. A scan read
    // the whole table on every attempt, making cost and latency grow with
    // signups — and giving an unauthenticated caller a cheap way to burn read
    // capacity.
    const result = await dynamoDB.send(new QueryCommand({
      TableName: userType === 'garage' ? 'Garages' : 'Clients',
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail },
      Limit: 1
    }))
    const user = result.Items?.[0] as AuthUser | undefined

    // One generic message for "no such account", "account has no password" and
    // "wrong password". Distinguishing them turns the login form into an
    // account-enumeration oracle: an attacker learns which email addresses are
    // registered just by submitting them. Same reason /api/auth/check-email no
    // longer returns anything but booleans.
    const invalidCredentials = NextResponse.json({
      success: false,
      error: 'Λάθος email ή κωδικός πρόσβασης'
    }, { status: 401 })

    if (!user || !user.passwordHash) {
      return invalidCredentials
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      return invalidCredentials
    }

    // Strip passwordHash from response
    if (userType === 'garage') {
      // Check if garage is validated/active
      if (!user.isActive) {
        logEvent({
          eventName: EventName.GarageLoginPendingValidation,
          actorType: 'garage',
          actorId: user.id,
          garageId: user.id,
          source: 'api/auth/login'
        })
        const pendingToken = await signToken({ userId: user.id, userType: 'garage' })
        const pendingResponse = NextResponse.json({
          success: true,
          pendingValidation: true,
          user: {
            id: user.id,
            companyName: user.companyName,
            email: user.email,
            isActive: false
          }
        })
        setAuthCookie(pendingResponse, pendingToken)
        return pendingResponse
      }

      logEvent({
        eventName: EventName.GarageLogin,
        actorType: 'garage',
        actorId: user.id,
        garageId: user.id,
        source: 'api/auth/login'
      })

      const token = await signToken({ userId: user.id, userType: 'garage' })
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          companyName: user.companyName,
          email: user.email,
          mobile: user.mobile,
          address: user.address,
          tin: user.tin,
          isActive: user.isActive
        }
      })
      setAuthCookie(response, token)
      return response
    } else {
      logEvent({
        eventName: EventName.ClientLogin,
        actorType: 'client',
        actorId: user.id,
        clientId: user.id,
        source: 'api/auth/login'
      })

      const token = await signToken({ userId: user.id, userType: 'client' })
      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber
        }
      })
      setAuthCookie(response, token)
      return response
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά τη σύνδεση' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
