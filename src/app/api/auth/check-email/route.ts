import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { createRateLimiter } from '@/utils/rateLimit'
import { withMetrics } from '@/utils/withMetrics'

/**
 * Tells the signup form whether an email already has an account, so it can show
 * a password field instead of a registration form.
 *
 * This endpoint is public and unauthenticated by design, which makes it an
 * account-enumeration oracle. Two things keep that contained:
 *
 *  1. It is rate limited per IP. Without a limit the whole user base could be
 *     enumerated by walking a list of candidate addresses.
 *  2. It returns ONLY booleans. It used to return the account holder's
 *     `firstName`, which handed an anonymous caller a real person's name for
 *     any email address they cared to guess — personal data disclosure with no
 *     authentication in front of it.
 */
const checkEmailRate = createRateLimiter('check-email', 20, 10 * 60 * 1000)

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

async function _POST(request: NextRequest) {
  try {
    if (!checkEmailRate(clientIp(request))) {
      return NextResponse.json(
        { error: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο.' },
        { status: 429 }
      )
    }

    const { email, userType } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Query the EmailIndex on either table rather than scanning. A full-table
    // scan on an unauthenticated endpoint is a cost-amplification lever: every
    // anonymous request would read the entire table.
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: userType === 'garage' ? 'Garages' : 'Clients',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': normalizedEmail },
        Limit: 1,
      })
    )
    const user = result.Items?.[0]

    if (!user) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      hasPassword: !!user.passwordHash,
    })
  } catch (error) {
    console.error('Check email error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export const POST = withMetrics(_POST)
