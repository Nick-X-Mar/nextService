import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export const TOKEN_COOKIE_NAME = 'auth-token'

// Session window: user stays logged in as long as they are active within this window.
// Every authenticated request refreshes the cookie (sliding session) — see middleware.
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
    throw new Error('JWT_SECRET env var is not set — refusing to sign/verify tokens')
  }
  return new TextEncoder().encode(key)
}

export interface AuthPayload {
  userId: string
  userType: 'client' | 'garage'
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      userId: payload.userId as string,
      userType: payload.userType as 'client' | 'garage',
    }
  } catch {
    return null
  }
}

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
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
