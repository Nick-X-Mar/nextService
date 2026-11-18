import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/utils/auth'

export const dynamic = 'force-dynamic'

/**
 * Where the installed app opens (`start_url` in src/app/manifest.ts): a
 * garage's dashboard, a client's requests, or the homepage for someone not
 * signed in. Decided here from the cookie, so the app never flashes the
 * homepage on its way to the account.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  const home = !auth ? '/'
    : auth.userType === 'garage' ? `/garage-dashboard/${auth.userId}/`
      : `/requests/${auth.userId}/`
  return NextResponse.redirect(new URL(home, request.url), 307)
}
