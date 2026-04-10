import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const secret = new TextEncoder().encode(JWT_SECRET_KEY)

const TOKEN_COOKIE_NAME = 'auth-token'
const TOKEN_EXPIRY = '7d'

export interface AuthPayload {
  userId: string
  userType: 'client' | 'garage'
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret)
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
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
    maxAge: 7 * 24 * 60 * 60, // 7 days
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
