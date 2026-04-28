import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/utils/auth'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'

async function _GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const { userId, userType } = auth
    const tableName = userType === 'garage' ? 'Garages' : 'Clients'

    const result = await dynamoDB.send(new GetCommand({
      TableName: tableName,
      Key: { id: userId },
    }))

    const user = result.Item
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    // Strip sensitive fields
    const { passwordHash: _passwordHash, passwordResetTokenHash: _passwordResetTokenHash, passwordResetExpiresAt: _passwordResetExpiresAt, ...safeUser } = user

    return NextResponse.json({
      authenticated: true,
      userType,
      user: safeUser,
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
