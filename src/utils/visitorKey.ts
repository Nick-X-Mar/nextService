import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Who a funnel event came from, without storing anything on the visitor's device: a
 * keyed hash of the IP, the browser's user agent and the UTC day, computed here.
 *
 * Most people fill the request form in signed out, with no clientId to count them by,
 * and the privacy policy promises no statistics cookies (no consent banner). So the
 * browser sends nothing — this key groups one person's steps within a day, changes at
 * midnight so days cannot be linked, and cannot be reversed without the server's secret.
 * The price is approximation: two people behind one carrier NAT on the same phone
 * model count as one, and a visit across midnight as two.
 */
export function visitorKey(request: NextRequest): string | undefined {
  const secret = process.env.JWT_SECRET
  if (!secret) return undefined
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  const userAgent = request.headers.get('user-agent') || ''
  const day = new Date().toISOString().slice(0, 10)
  const digest = createHmac('sha256', secret).update(`funnel-visitor\n${day}\n${ip}\n${userAgent}`).digest('hex')
  return `v_${digest.slice(0, 24)}`
}
