import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/utils/auth'

export const dynamic = 'force-dynamic'

/**
 * Where the installed app opens (`start_url` in src/app/manifest.ts): a
 * garage's dashboard, a client's requests, or the homepage for someone not
 * signed in. Decided here from the cookie, so the app never flashes the
 * homepage on its way to the account.
 *
 * The Location is a bare path: on Amplify a route handler's `request.url` is
 * the server's own `localhost:3000`, and an absolute URL built from it sent
 * the installed app there. A path keeps whichever domain the app was opened on.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  const home = !auth ? '/'
    : auth.userType === 'garage' ? `/garage-dashboard/${auth.userId}/`
      : `/requests/${auth.userId}/`
  return new NextResponse(null, { status: 307, headers: { Location: home } })
}
