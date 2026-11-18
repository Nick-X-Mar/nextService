import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export const TOKEN_COOKIE_NAME = 'auth-token'

// Session window: user stays logged in as long as they are active within this window.
// The cookie slides: an authenticated request re-issues it once the token is at
// least min(1h, SESSION_EXPIRY/2) old, not on every request — see middleware.
const SESSION_EXPIRY = process.env.SESSION_EXPIRY || '2d'
const SESSION_MAX_AGE_SEC = (() => {
  const m = SESSION_EXPIRY.match(/^(\d+)([smhd])$/)
  if (!m) return 2 * 24 * 60 * 60
  const n = parseInt(m[1], 10)
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd']
  return n * mult
})()

/**
 * The installed app (the PWA) keeps its user signed in a little longer: a
 * session that started there, or that the app took over
 * (`/api/auth/app-session`), carries `app: true` and slides over 3 days
 * instead of SESSION_EXPIRY, so opening the app every few days never asks
 * for the password again. A browser tab keeps the short window: it may be a
 * shared computer.
 */
export const APP_SESSION_EXPIRY = '3d'
export const APP_SESSION_MAX_AGE_SEC = 3 * 24 * 60 * 60

function getSecret(): Uint8Array {
  const key = process.env.JWT_SECRET
  if (!key) {
    throw new Error('JWT_SECRET env var is not set — refusing to sign/verify tokens')
  }
  return new TextEncoder().encode(key)
}

export interface AuthPayload {
  userId: string
  userType: 'client' | 'garage'
  /** A session of the installed app: see APP_SESSION_EXPIRY. */
  app?: boolean
}

export async function signToken({ userId, userType, app }: AuthPayload): Promise<string> {
  return new SignJWT(app ? { userId, userType, app: true } : { userId, userType })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(app ? APP_SESSION_EXPIRY : SESSION_EXPIRY)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      userId: payload.userId as string,
      userType: payload.userType as 'client' | 'garage',
      app: payload.app === true,
    }
  } catch {
    return null
  }
}

export function setAuthCookie(response: NextResponse, token: string, app = false): void {
  response.cookies.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: app ? APP_SESSION_MAX_AGE_SEC : SESSION_MAX_AGE_SEC,
  })
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getAuthFromRequest(request: NextRequest): Promise<AuthPayload | null> {
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}
