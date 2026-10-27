import { NextRequest, NextResponse } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { createTtlCache } from '@/utils/ttlCache'

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

// Short enough that an admin deactivation bites within half a minute on every
// instance; the admin activate/deactivate routes also invalidate it directly.
const garageActiveCache = createTtlCache<boolean>(30_000)

/** Forget a garage's cached active flag — call after changing `isActive`. */
export function invalidateGarageActive(garageId: string): void {
  garageActiveCache.invalidate(garageId)
}

/**
 * Require an authenticated garage that an admin has approved (`isActive === true`,
 * the same test login uses). A pending or deactivated garage still holds a valid
 * garage JWT — login issues one so it can see its pending screen — so any route
 * that exposes client data or lets a garage act on the marketplace must use this
 * rather than `requireGarage`. Returns garageId or a 401/403 response; the 403
 * carries `code: 'GARAGE_INACTIVE'` so the dashboard can show the pending state.
 */
export async function requireActiveGarage(request: NextRequest): Promise<string | NextResponse> {
  const garageId = requireGarage(request)
  if (garageId instanceof NextResponse) return garageId

  const active = await garageActiveCache.getOrCompute(garageId, async () => {
    const res = await dynamoDB.send(
      new GetCommand({ TableName: 'Garages', Key: { id: garageId }, ProjectionExpression: 'isActive' })
    )
    return res.Item?.isActive === true
  })

  if (!active) {
    return NextResponse.json(
      { error: 'Ο λογαριασμός του συνεργείου δεν έχει εγκριθεί ακόμη', code: 'GARAGE_INACTIVE' },
      { status: 403 }
    )
  }
  return garageId
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
