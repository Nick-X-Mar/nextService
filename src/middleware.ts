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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin section ────────────────────────────────────────
  // Admin pages and admin API have their own auth system (separate JWT cookie).
  // Handled completely independently from the client/garage auth below.
  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin')

  if (isAdminPage || isAdminApi) {
    // Public admin routes — login page and login API
    if (pathname === '/admin/login' || pathname === '/api/admin/auth/login') {
      return NextResponse.next()
    }

    const adminToken = request.cookies.get(ADMIN_COOKIE)?.value

    if (!adminToken) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const admin = await verifyAdminToken(adminToken)
    if (!admin) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const adminHeaders = new Headers(request.headers)
    adminHeaders.set('x-admin-id', admin.adminId)
    adminHeaders.set('x-admin-email', admin.email)
    adminHeaders.set('x-admin-role', admin.role)

    return NextResponse.next({ request: { headers: adminHeaders } })
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
          const requestHeaders = new Headers(request.headers)
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
    return NextResponse.next()
  }

  // Allow GET on garage profile (public data) and photo routes
  // Use garage- prefix to avoid matching sub-routes like /api/garage/available-requests
  if (
    (pathname.match(/^\/api\/garage\/garage-[^/]+$/) && request.method === 'GET') ||
    pathname.startsWith('/api/photos/')
  ) {
    return NextResponse.next()
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
    const requestHeaders = new Headers(request.headers)
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
  matcher: ['/api/:path*', '/admin/:path*'],
}
