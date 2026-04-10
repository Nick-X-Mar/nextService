import { NextRequest, NextResponse } from 'next/server'

export interface AuthInfo {
  userId: string
  userType: 'client' | 'garage'
}

/**
 * Extract verified auth info from request headers (set by middleware).
 * Returns null if not authenticated.
 */
export function getAuth(request: NextRequest): AuthInfo | null {
  const userId = request.headers.get('x-user-id')
  const userType = request.headers.get('x-user-type') as 'client' | 'garage' | null

  if (!userId || !userType) return null
  return { userId, userType }
}

/**
 * Require authentication. Returns auth info or a 401 response.
 */
export function requireAuth(request: NextRequest): AuthInfo | NextResponse {
  const auth = getAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  }
  return auth
}

/**
 * Require the authenticated user to be a client. Returns clientId or a 403 response.
 */
export function requireClient(request: NextRequest): string | NextResponse {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.userType !== 'client') {
    return NextResponse.json({ error: 'Απαιτείται λογαριασμός πελάτη' }, { status: 403 })
  }
  return auth.userId
}

/**
 * Require the authenticated user to be a garage. Returns garageId or a 403 response.
 */
export function requireGarage(request: NextRequest): string | NextResponse {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.userType !== 'garage') {
    return NextResponse.json({ error: 'Απαιτείται λογαριασμός συνεργείου' }, { status: 403 })
  }
  return auth.userId
}

/**
 * Require the authenticated user to own the specified resource.
 * Returns auth info or a 403 response.
 */
export function requireOwner(request: NextRequest, resourceOwnerId: string): AuthInfo | NextResponse {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.userId !== resourceOwnerId) {
    return NextResponse.json({ error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
  }
  return auth
}
