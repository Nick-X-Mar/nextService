import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { verifyPassword } from '@/utils/passwordService'
import { signAdminToken, setAdminCookie } from '@/utils/adminAuth'
import { ensureAdminUsersTable, ADMIN_USERS_TABLE_NAME } from '@/utils/ensureAdminTables'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

const checkIPRate = createRateLimiter('admin-login-ip', 5, 3600000)
const checkEmailRate = createRateLimiter('admin-login-email', 3, 3600000)

async function _POST(request: NextRequest) {
  try {
    await ensureAdminUsersTable()

    const body = await request.json()
    const { email, password } = body

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    if (!checkIPRate(clientIP)) {
      return NextResponse.json({ error: 'Too many login attempts. Try again in 1 hour.' }, { status: 429 })
    }

    if (!checkEmailRate(email)) {
      return NextResponse.json({ error: 'Too many attempts for this email. Try again in 1 hour.' }, { status: 429 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const result = await dynamoDB.send(new QueryCommand({
      TableName: ADMIN_USERS_TABLE_NAME,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail }
    }))

    const admin = result.Items?.[0]

    if (!admin) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!admin.isActive) {
      return NextResponse.json({ error: 'Account is disabled' }, { status: 403 })
    }

    const passwordValid = await verifyPassword(password, admin.passwordHash)
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Update last login
    await dynamoDB.send(new UpdateCommand({
      TableName: ADMIN_USERS_TABLE_NAME,
      Key: { adminId: admin.adminId },
      UpdateExpression: 'SET lastLoginAt = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() }
    }))

    const token = await signAdminToken({
      adminId: admin.adminId,
      email: admin.email,
      role: admin.role
    })

    const response = NextResponse.json({
      success: true,
      admin: {
        adminId: admin.adminId,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role
      }
    })

    setAdminCookie(response, token)
    return response
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
