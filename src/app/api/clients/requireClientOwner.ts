import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, type AuthInfo } from '@/utils/requireAuth'

/**
 * The signed-in client whose id is in the URL, or a 401/403.
 *
 * `requireOwner` compares ids only; these routes also pin the account type, so
 * nothing but a client session can ever reach a client's profile or cars.
 */
export function requireClientOwner(request: NextRequest, clientId: string): AuthInfo | NextResponse {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.userType !== 'client' || auth.userId !== clientId) {
    return NextResponse.json({ error: 'Δεν έχετε πρόσβαση σε αυτόν τον πόρο' }, { status: 403 })
  }
  return auth
}
