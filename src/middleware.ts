import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'
import { verifyAdminToken, ADMIN_COOKIE } from '@/utils/adminAuth'

const TOKEN_COOKIE_NAME = 'auth-token'
const SESSION_EXPIRY = process.env.SESSION_EXPIRY || '2d'
const SESSION_MAX_AGE_SEC = (() => {
  const m = SESSION_EXPIRY.match(/^(\d+)([smhd])$/)
  if (!m) return 2 * 24 * 60 * 60
  const n = parseInt(m[1], 10)
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd']
  return n * mult
})()

function getSecret(): Uint8Array {
  const key = process.env.JWT_SECRET
  if (!key) {
    throw new Error('JWT_SECRET env var is not set — refusing to verify tokens')
  }
  return new TextEncoder().encode(key)
}

// Routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/price-estimation',
  '/api/service-request',
  '/api/hot-deals',
  '/api/track',
]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
}

// Pages that require a signed-in user of a specific type. Guarded server-side so
// the decision comes from the httpOnly cookie and nothing else — a cached
// identity in localStorage must never be enough to open one of these. Keep in
// sync with the `matcher` at the bottom of this file.
const PROTECTED_PAGES: { prefix: string; userType: 'client' | 'garage' }[] = [
  { prefix: '/garage-dashboard', userType: 'garage' },
  { prefix: '/requests', userType: 'client' },
  { prefix: '/profile', userType: 'client' },
]

function matchProtectedPage(pathname: string) {
  return PROTECTED_PAGES.find(
    p => pathname === p.prefix || pathname.startsWith(p.prefix + '/')
  )
}

/** Where a signed-in user belongs when they land somewhere that isn't theirs. */
function homeFor(userType: string, userId: string): string {
  return userType === 'garage'
    ? `/garage-dashboard/${userId}/`
    : `/requests/${userId}/`
}

async function issueRefreshedToken(userId: string, userType: string): Promise<string> {
  return new SignJWT({ userId, userType })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

function applySlidingCookie(response: NextResponse, token: string): void {
  response.cookies.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  })
}

/**
 * Identity headers are minted here and nowhere else.
 *
 * `requireAuth`/`getAuth` downstream read `x-user-id` and `x-user-type` and trust them
 * completely — which is correct only if a caller can never set them. The public-route
 * branch below forwards the request untouched when there is no cookie, so before this
 * existed a plain `curl -H "x-user-id: client-<someone>" /api/service-request` created a
 * service request inside that person's account with no credential at all. Anything
 * arriving from outside is stripped first; the verified values are set afterwards.
 */
function withoutClientIdentity(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  headers.delete('x-user-id')
  headers.delete('x-user-type')
  headers.delete('x-admin-id')
  headers.delete('x-admin-email')
  headers.delete('x-admin-role')
  return headers
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin section ────────────────────────────────────────
  // Admin pages and admin API have their own auth system (separate JWT cookie).
  // Handled completely independently from the client/garage auth below.
  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin')

  if (isAdminPage || isAdminApi) {
    // Public admin routes — login page and login API (match both with and
    // without trailing slash since trailingSlash: true is enabled in next.config)
    const normalized = pathname.replace(/\/$/, '')
    if (normalized === '/admin/login' || normalized === '/api/admin/auth/login') {
      return NextResponse.next({ request: { headers: withoutClientIdentity(request) } })
    }

    const adminToken = request.cookies.get(ADMIN_COOKIE)?.value

    if (!adminToken) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login/', request.url))
    }

    const admin = await verifyAdminToken(adminToken)
    if (!admin) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login/', request.url))
    }

    const adminHeaders = withoutClientIdentity(request)
    adminHeaders.set('x-admin-id', admin.adminId)
    adminHeaders.set('x-admin-email', admin.email)
    adminHeaders.set('x-admin-role', admin.role)

    return NextResponse.next({ request: { headers: adminHeaders } })
  }

  // ── Protected pages (client + garage) ────────────────────
  // The cookie is the only source of truth. The client-side guard this replaces
  // trusted a stale localStorage cache, which both bounced freshly-approved
  // garages into a /login ↔ dashboard redirect loop and — on a browser someone
  // forgot to sign out of — rendered the previous user's area for whoever came
  // next. `isActive` is deliberately NOT checked here: that would cost a
  // DynamoDB read on every page view; the dashboard renders the status panel.
  const protectedPage = matchProtectedPage(pathname)
  if (protectedPage) {
    const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value
    const loginUrl = new URL('/login/', request.url)
    loginUrl.searchParams.set('next', pathname)

    if (!token) {
      return NextResponse.redirect(loginUrl)
    }

    try {
      const { payload } = await jwtVerify(token, getSecret())
      const userId = payload.userId as string
      const userType = payload.userType as string

      if (!userId || !userType) {
        return NextResponse.redirect(loginUrl)
      }

      // Signed in, but as the other kind of user — send them to their own area
      // rather than to a login form they don't actually need.
      if (userType !== protectedPage.userType) {
        return NextResponse.redirect(new URL(homeFor(userType, userId), request.url))
      }

      // The id in the URL is part of the identity: /requests/<someone-else>/…
      // must never render. The APIs behind it already answer 403, but that only
      // produced an empty broken page instead of an honest redirect.
      const ownerId = pathname.split('/')[2]
      if (
        ownerId &&
        ownerId !== userId &&
        (ownerId.startsWith('client-') || ownerId.startsWith('garage-'))
      ) {
        return NextResponse.redirect(new URL(homeFor(userType, userId), request.url))
      }

      const response = NextResponse.next()
      // Sliding session on page views too, so someone browsing their own area
      // never expires mid-session.
      const refreshed = await issueRefreshedToken(userId, userType)
      applySlidingCookie(response, refreshed)
      return response
    } catch {
      return NextResponse.redirect(loginUrl)
    }
  }

  // Only protect API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Auth routes (login/logout/me) manage the cookie themselves — never refresh here,
  // otherwise logout could race with a sliding refresh.
  const isAuthRoute = pathname.startsWith('/api/auth/')

  // Public routes: don't require auth but still extract identity if token exists
  if (isPublicRoute(pathname)) {
    const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecret())
        const userId = payload.userId as string
        const userType = payload.userType as string
        if (userId && userType) {
          const requestHeaders = withoutClientIdentity(request)
          requestHeaders.set('x-user-id', userId)
          requestHeaders.set('x-user-type', userType)
          const response = NextResponse.next({ request: { headers: requestHeaders } })
          if (!isAuthRoute) {
            const refreshed = await issueRefreshedToken(userId, userType)
            applySlidingCookie(response, refreshed)
          }
          return response
        }
      } catch {
        // Token invalid/expired — proceed as unauthenticated
      }
    }
    // No usable cookie: the caller is anonymous, and must reach the route that way.
    return NextResponse.next({ request: { headers: withoutClientIdentity(request) } })
  }

  // Allow GET on garage profile (public data) and photo routes.
  // Use garage- prefix to avoid matching sub-routes like /api/garage/available-requests.
  // Trailing slash is optional because next.config has trailingSlash: true.
  if (
    (pathname.match(/^\/api\/garage\/garage-[^/]+\/?$/) && request.method === 'GET') ||
    pathname.startsWith('/api/photos/')
  ) {
    return NextResponse.next({ request: { headers: withoutClientIdentity(request) } })
  }

  // Verify JWT token
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json(
      { error: 'Απαιτείται σύνδεση' },
      { status: 401 }
    )
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const userId = payload.userId as string
    const userType = payload.userType as string

    if (!userId || !userType) {
      return NextResponse.json(
        { error: 'Μη έγκυρο token' },
        { status: 401 }
      )
    }

    // Inject verified identity into request headers for downstream routes
    const requestHeaders = withoutClientIdentity(request)
    requestHeaders.set('x-user-id', userId)
    requestHeaders.set('x-user-type', userType)

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })

    // Sliding session: every authenticated request extends the cookie window
    const refreshed = await issueRefreshedToken(userId, userType)
    applySlidingCookie(response, refreshed)

    return response
  } catch {
    return NextResponse.json(
      { error: 'Μη έγκυρο ή ληγμένο token' },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    // Mirrors PROTECTED_PAGES above — a prefix listed there but missing here is
    // simply not guarded, so the two lists have to move together.
    '/garage-dashboard/:path*',
    '/requests/:path*',
    '/profile/:path*',
  ],
}
