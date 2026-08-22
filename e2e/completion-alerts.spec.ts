import { test, expect, type APIRequestContext } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { ageAppointment } from './dynamo-helpers'

/**
 * The in-app prompts that actually drive the completion flow.
 *
 * Email is not the mechanism here — NOTIFICATIONS_ENABLED is false in
 * production — so if these alerts do not appear, nothing ever asks the garage
 * whether the job happened and the request sits in APPOINTMENT forever.
 */

const PASSWORD = 'TestPass123'
const FUTURE_DATES = ['2027-05-20', '2027-05-21']

/**
 * The summary is cached per user for 20s. Routes that change what it counts
 * invalidate it, but this test ages an appointment straight in DynamoDB —
 * something the app cannot know about — so the first read has to wait the
 * window out rather than assume it.
 */
async function alertsUntil(
  request: APIRequestContext,
  token: string,
  predicate: (alerts: { kind: string; id: string }[]) => boolean,
  timeoutMs = 30_000
): Promise<{ kind: string; id: string }[]> {
  const deadline = Date.now() + timeoutMs
  let alerts: { kind: string; id: string }[] = []
  for (;;) {
    const res = await request.get('/api/notifications/summary/', {
      headers: { Cookie: `auth-token=${token}` },
    })
    alerts = (await res.json()).alerts ?? []
    if (predicate(alerts) || Date.now() > deadline) return alerts
    await new Promise((r) => setTimeout(r, 2000))
  }
}

test('A passed appointment raises a completion prompt for the garage, then a review prompt for the client', async ({ request }) => {
  const email = `e2e-alert-${Date.now()}@test.com`
  const reg = await registerClient(request, email, PASSWORD)
  const clientId = reg.client.id
  const clientToken = (await loginViaAPI(request, email, PASSWORD, 'client')).token
  const garageToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token

  const sr = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${clientToken}` },
    data: {
      clientId, category: 'allagi-ladion', description: 'E2E alerts',
      brand: 'Seat', model: 'Ibiza', modelYear: '2018', engineCC: '1000',
      fuelType: 'petrol', isAutomatic: false, is4x4: false,
    },
  })
  const requestId = (await sr.json()).serviceRequestId

  const offer = await request.post('/api/offers', {
    headers: { Cookie: `auth-token=${garageToken}` },
    data: { serviceRequestId: requestId, offerAmount: 150, benefits: [], availableDates: FUTURE_DATES },
  })
  const offerId = (await offer.json()).offer.id

  await request.patch(`/api/requests/${requestId}/accept-offer/`, {
    headers: { Cookie: `auth-token=${clientToken}` },
    data: { offerId, appointmentDate: FUTURE_DATES[0], appointmentTime: '10:00', appointmentPrice: 150 },
  })

  await ageAppointment(requestId, 2)

  const garageAlerts = await alertsUntil(request, garageToken, (alerts) =>
    alerts.some((a) => a.kind === 'completion-due' && a.id.includes(requestId))
  )
  expect(garageAlerts.some((a) => a.kind === 'completion-due' && a.id.includes(requestId))).toBe(true)

  // The client has nothing to review until the garage closes it.
  const before = await request.get('/api/notifications/summary/', {
    headers: { Cookie: `auth-token=${clientToken}` },
  })
  const beforeAlerts = (await before.json()).alerts as { kind: string }[]
  expect(beforeAlerts.some((a) => a.kind === 'review-due')).toBe(false)

  const complete = await request.post(`/api/requests/${requestId}/complete/`, {
    headers: { Cookie: `auth-token=${garageToken}` },
    data: { outcome: 'completed', amount: 186, vatIncluded: true },
  })
  expect(complete.status()).toBe(200)

  const after = await request.get('/api/notifications/summary/', {
    headers: { Cookie: `auth-token=${clientToken}` },
  })
  const afterAlerts = (await after.json()).alerts as { kind: string; id: string }[]
  expect(afterAlerts.some((a) => a.kind === 'review-due' && a.id.includes(requestId))).toBe(true)

  // And the garage's completion prompt is gone, replaced by its own review nudge.
  const garageAfter = await request.get('/api/notifications/summary/', {
    headers: { Cookie: `auth-token=${garageToken}` },
  })
  const garageAfterAlerts = (await garageAfter.json()).alerts as { kind: string; id: string }[]
  expect(garageAfterAlerts.some((a) => a.kind === 'completion-due' && a.id.includes(requestId))).toBe(false)
  expect(garageAfterAlerts.some((a) => a.kind === 'review-due')).toBe(true)
})
