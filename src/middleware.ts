import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const secret = new TextEncoder().encode(JWT_SECRET_KEY)
const TOKEN_COOKIE_NAME = 'auth-token'

// Routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/price-estimation',
  '/api/service-request',
]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // Allow GET on garage profile (public data) and photo routes
  if (
    (pathname.match(/^\/api\/garage\/[^/]+$/) && request.method === 'GET') ||
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
    const { payload } = await jwtVerify(token, secret)
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

    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  } catch {
    return NextResponse.json(
      { error: 'Μη έγκυρο ή ληγμένο token' },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: '/api/:path*',
}
