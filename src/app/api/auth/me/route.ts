import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookie, getAuthFromRequest } from '@/utils/auth'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'
import { PENDING_MERGE_FIELDS } from '../_lib/guestMerge'

// Never leaves the server: credentials, reset state and the pending-merge
// token (whose hash alone must not reach the browser that asked for it).
const PRIVATE_FIELDS = new Set<string>([
  'passwordHash',
  'passwordResetTokenHash',
  'passwordResetExpiresAt',
  ...PENDING_MERGE_FIELDS,
])

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
    // A guest folded into an account survives only as a tombstone, and a
    // closed account as an anonymized row. Neither session has anything left
    // behind it, so end it rather than keep a ghost signed in.
    if (!user || user.mergedInto || user.anonymizedAt) {
      const response = NextResponse.json({ authenticated: false }, { status: 401 })
      if (user?.mergedInto || user?.anonymizedAt) clearAuthCookie(response)
      return response
    }

    const safeUser = Object.fromEntries(
      Object.entries(user).filter(([key]) => !PRIVATE_FIELDS.has(key))
    )

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
