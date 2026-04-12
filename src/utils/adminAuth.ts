import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-dev-secret-change-in-production'
const secret = new TextEncoder().encode(ADMIN_JWT_SECRET)

const ADMIN_COOKIE_NAME = 'ns-admin-session'
const ADMIN_SESSION_EXPIRY = process.env.ADMIN_SESSION_EXPIRY || '8h'

export interface AdminPayload {
  adminId: string
  email: string
  role: 'super_admin' | 'admin'
}

export async function signAdminToken(payload: AdminPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ADMIN_SESSION_EXPIRY)
    .sign(secret)
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      role: payload.role as 'super_admin' | 'admin',
    }
  } catch {
    return null
  }
}

export function setAdminCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  })
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getAdminFromRequest(request: NextRequest): Promise<AdminPayload | null> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!token) return null
  return verifyAdminToken(token)
}

export const ADMIN_COOKIE = ADMIN_COOKIE_NAME
