import { NextRequest, NextResponse } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { getAuthFromRequest, setAuthCookie, signToken } from '@/utils/auth'
import { dynamoDB } from '@/utils/dynamoService'
import { withMetrics } from '@/utils/withMetrics'
import { TABLES } from '@/lib/tables'

/**
 * The installed app takes over this device's session, so it stays signed in
 * (APP_SESSION_EXPIRY in utils/auth.ts). PwaManager calls it whenever the
 * site runs as the installed app with someone signed in: after signing in
 * there, and on Android, where the app shares Chrome's cookies, for a session
 * that began in the browser.
 *
 * Only the session already in the cookie is extended, never one named in the
 * body, and not one /api/auth/me would end (a merged guest, a closed account).
 */
async function _POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  // A visitor with no session: an answer, not a 401 (see /api/auth/me).
  if (!auth) return NextResponse.json({ app: false })
  if (auth.app) return NextResponse.json({ app: true })

  const user = (await dynamoDB.send(new GetCommand({
    TableName: auth.userType === 'garage' ? TABLES.Garages : TABLES.Clients,
    Key: { id: auth.userId },
    ProjectionExpression: 'id, mergedInto, anonymizedAt',
  }))).Item
  if (!user || user.mergedInto || user.anonymizedAt) return NextResponse.json({ app: false })

  const response = NextResponse.json({ app: true })
  setAuthCookie(response, await signToken({ userId: auth.userId, userType: auth.userType, app: true }), true)
  return response
}

export const POST = withMetrics(_POST)
