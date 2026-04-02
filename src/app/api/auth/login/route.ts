import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { verifyPassword } from '@/utils/passwordService'

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 3600000): boolean {
  const now = Date.now()
  const key = `login:${identifier}`
  const current = rateLimitMap.get(key)

  if (!current || now > current.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }
  if (current.count >= maxAttempts) return false
  current.count++
  return true
}

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

    if (!checkRateLimit(clientIP, 10, 3600000)) {
      return NextResponse.json({
        error: 'Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε 1 ώρα.'
      }, { status: 429 })
    }

    if (!checkRateLimit(`email:${email}`, 5, 3600000)) {
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
        return NextResponse.json({
          success: true,
          pendingValidation: true,
          user: {
            id: user.id,
            companyName: user.companyName,
            email: user.email,
            isActive: false
          }
        })
      }

      return NextResponse.json({
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
    } else {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber
        }
      })
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Σφάλμα κατά τη σύνδεση' }, { status: 500 })
  }
}
