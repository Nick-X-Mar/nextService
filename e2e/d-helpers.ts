import { expect, type APIRequestContext } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { athensToday } from '../src/utils/athensTime'

/**
 * Fixtures for the request lifecycle: a client, a request, an offer and an
 * accepted appointment, built through the real API so every step runs the
 * same checks a real booking does.
 */

export const PASSWORD = 'TestPass123'

/**
 * An Athens calendar date `days` from today. Fixtures are relative because the
 * booking API refuses dates in the past — a hard-coded "future" date is a test
 * that starts failing on a known day.
 */
export function athensDatePlus(days: number): string {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export interface TestClient {
  clientId: string
  token: string
  email: string
}

export async function newClient(request: APIRequestContext, prefix: string): Promise<TestClient> {
  const email = `e2e-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`
  const reg = await registerClient(request, email, PASSWORD)
  expect(reg.client?.id, `registration failed: ${JSON.stringify(reg)}`).toBeTruthy()
  const { token } = await loginViaAPI(request, email, PASSWORD, 'client')
  return { clientId: reg.client.id, token, email }
}

export async function garageToken(request: APIRequestContext): Promise<string> {
  return (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
}

export async function createRequest(
  request: APIRequestContext,
  client: TestClient,
  description: string
): Promise<string> {
  const resp = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${client.token}` },
    data: {
      clientId: client.clientId,
      category: 'allagi-ladion',
      description,
      brand: 'Toyota',
      model: 'Yaris',
      modelYear: '2018',
      engineCC: '1300',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
    },
  })
  expect(resp.status(), await resp.text()).toBe(200)
  return (await resp.json()).serviceRequestId
}

export async function createOffer(
  request: APIRequestContext,
  token: string,
  requestId: string,
  offerAmount: number,
  availabilityDates: string[]
): Promise<string> {
  const resp = await request.post('/api/offers', {
    headers: { Cookie: `auth-token=${token}` },
    data: { serviceRequestId: requestId, offerAmount, benefits: [], availabilityDates },
  })
  expect(resp.status(), await resp.text()).toBe(200)
  return (await resp.json()).offer.id
}

export function acceptOffer(
  request: APIRequestContext,
  client: TestClient,
  requestId: string,
  data: Record<string, unknown>
) {
  return request.patch(`/api/requests/${requestId}/accept-offer/`, {
    headers: { Cookie: `auth-token=${client.token}` },
    data,
  })
}

export function cancelAppointment(request: APIRequestContext, client: TestClient, requestId: string) {
  return request.patch(`/api/requests/${requestId}/cancel/`, {
    headers: { Cookie: `auth-token=${client.token}` },
  })
}

/** A request with one pending offer from the test garage, on a future date. */
export async function requestWithOffer(
  request: APIRequestContext,
  client: TestClient,
  opts: { description: string; offerAmount?: number; inDays?: number }
): Promise<{ requestId: string; offerId: string; date: string; garage: string }> {
  const date = athensDatePlus(opts.inDays ?? 30)
  const garage = await garageToken(request)
  const requestId = await createRequest(request, client, opts.description)
  const offerId = await createOffer(request, garage, requestId, opts.offerAmount ?? 150, [date])
  return { requestId, offerId, date, garage }
}

/** The same, accepted: the request is in APPOINTMENT with the test garage. */
export async function bookedAppointment(
  request: APIRequestContext,
  client: TestClient,
  opts: { description: string; offerAmount?: number; inDays?: number }
): Promise<{ requestId: string; offerId: string; date: string; garage: string }> {
  const booked = await requestWithOffer(request, client, opts)
  const accept = await acceptOffer(request, client, booked.requestId, {
    offerId: booked.offerId,
    appointmentDate: booked.date,
    appointmentTime: '10:00',
  })
  expect(accept.status(), await accept.text()).toBe(200)
  return booked
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nextservice.gr'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

/** The admin session cookie, as `Cookie` header value. */
export async function adminCookie(request: APIRequestContext): Promise<string> {
  const resp = await request.post('/api/admin/auth/login/', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(resp.status(), 'admin login failed — run scripts/seed-admin.ts').toBe(200)
  const match = (resp.headers()['set-cookie'] || '').match(/ns-admin-session=([^;]+)/)
  expect(match).toBeTruthy()
  return `ns-admin-session=${match![1]}`
}

/** An admin's deactivation, through the admin route so the active-flag cache is dropped too. */
export async function deactivateGarage(request: APIRequestContext, admin: string, garageId: string) {
  const resp = await request.post(`/api/admin/users/garages/${garageId}/deactivate/`, {
    headers: { Cookie: admin },
  })
  expect(resp.status(), await resp.text()).toBe(200)
}

export function adminCancel(request: APIRequestContext, admin: string, requestId: string) {
  return request.patch(`/api/admin/requests/${requestId}/cancel/`, { headers: { Cookie: admin } })
}

export function adminAssign(
  request: APIRequestContext,
  admin: string,
  requestId: string,
  data: { garageId: string; price: unknown; availabilityDates?: string[] }
) {
  return request.post(`/api/admin/requests/${requestId}/assign/`, { headers: { Cookie: admin }, data })
}
