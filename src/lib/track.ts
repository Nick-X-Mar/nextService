import type { EventNameValue } from '@/types/events'

/**
 * Records a request-form funnel step. Nothing identifying is sent or stored in the
 * browser: /api/track groups the steps by a daily visitor key it derives itself
 * (`visitorKey`). Fire-and-forget, with `keepalive` so a step fired right before a
 * navigation (category picked, step 1 done) is not cancelled with the page that sent it.
 */
export function track(eventName: EventNameValue, metadata?: Record<string, unknown>): void {
  fetch('/api/track/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ eventName, metadata }),
  }).catch(() => {})
}

/**
 * The top of the funnel, on each full page load: where the visit landed, which site
 * sent it (host only) and whether it is a phone-sized screen. Repeats are harmless —
 * the funnel counts each visitor once a day.
 */
export function trackVisitStart(): void {
  let referrer = ''
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname : ''
  } catch {}
  track('visit_started', {
    path: window.location.pathname,
    referrer: referrer === window.location.hostname ? '' : referrer,
    mobile: window.matchMedia('(max-width: 767px)').matches,
  })
}
