import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { verifyPassword } from '@/utils/passwordService'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import { signToken, setAuthCookie } from '@/utils/auth'
import { createRateLimiter } from '@/utils/rateLimit'

const checkIPRate = createRateLimiter('login-ip', 10, 3600000)
const checkEmailRate = createRateLimiter('login-email', 5, 3600000)

export async function POST(request: NextRequest) {
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
    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    const result = await dynamoDB.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail }
    }))

    const user = result.Items?.[0]

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Δεν βρέθηκε λογαριασμός με αυτό το email'
      }, { status: 401 })
    }

    if (!user.passwordHash) {
      return NextResponse.json({
        success: false,
        error: 'Ο λογαριασμός δεν έχει κωδικό. Επικοινωνήστε με την υποστήριξη.'
      }, { status: 401 })
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      return NextResponse.json({
        success: false,
        error: 'Λάθος κωδικός πρόσβασης'
      }, { status: 401 })
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
