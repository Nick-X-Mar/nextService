import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/utils/eventLogger'
import { EventName } from '@/types/events'
import type { EventNameValue } from '@/types/events'
import { getAuth } from '@/utils/requireAuth'
import { createRateLimiter } from '@/utils/rateLimit'

// Events allowed from client-side (whitelist to prevent abuse)
const ALLOWED_EVENTS = new Set<EventNameValue>([
  EventName.CategorySelected,
  EventName.CarDetailsStarted,
  EventName.CarDetailsCompleted,
  EventName.CarSpecsStarted,
  EventName.PaymentAbandoned,
])

// 30 events per minute per IP
const checkTrackRate = createRateLimiter('track', 30, 60000)

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!checkTrackRate(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const body = await request.json()
    const { eventName, metadata } = body

    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }

    // Use authenticated clientId from JWT when available, ignore body.clientId
    const auth = getAuth(request)
    const clientId = auth?.userType === 'client' ? auth.userId : undefined

    logEvent({
      eventName,
      actorType: 'client',
      actorId: clientId,
      clientId,
      metadata: metadata || undefined,
      source: 'client-side',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
