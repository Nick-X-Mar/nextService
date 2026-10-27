import { expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { setAuthCookie } from './helpers'
import { athensToday } from '../src/utils/athensTime'

/**
 * Fixtures for the winner-only PII spec.
 *
 * Every caller is a throwaway account: the rule under test is about which of
 * several garages on one request sees what, and the shared TEST_GARAGE has bid
 * on hundreds of requests. Calls go through plain `fetch` with one explicit
 * session each — a Playwright request context keeps a cookie jar, and a jar
 * cookie riding along with the explicit one would blur whose view a response is.
 *
 * Local only: DynamoDB Local with dummy credentials, and only rows these
 * fixtures created are ever written.
 */

const BASE_URL = 'http://localhost:3000'
export const PASSWORD = 'TestPass123'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

export const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

export interface ApiResult {
  status: number
  // Loose on purpose: the specs assert on the shape, they don't trust it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  authToken: string | null
}

/** One call, as exactly one caller (or nobody). */
export async function api(
  path: string,
  { method = 'GET', token, body }: { method?: string; token?: string; body?: unknown } = {}
): Promise<ApiResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Cookie: `auth-token=${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const auth = res.headers.getSetCookie().find((c) => c.startsWith('auth-token='))
  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
    authToken: auth ? auth.slice('auth-token='.length).split(';')[0] : null,
  }
}

/** An Athens calendar date `days` from today. */
export function athensDatePlus(days: number): string {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export const OFFER_DATES = [athensDatePlus(20), athensDatePlus(21)]

export interface Party {
  id: string
  email: string
  token: string
  user?: Record<string, unknown>
}

/**
 * A client registered through the real route. With a profile it is saved the
 * way the profile screen does; without one the account keeps the name the
 * route invents for it — the local part of the email.
 */
export async function newClient(
  prefix: string,
  profile?: { firstName: string; lastName: string; phoneNumber: string; address: string }
): Promise<Party> {
  const email = `e2e-p-${prefix}-${unique()}@test.com`
  const reg = await api('/api/auth/register/', { method: 'POST', body: { email, password: PASSWORD, acceptedTerms: true } })
  expect(reg.status, `register failed: ${JSON.stringify(reg.data)}`).toBe(200)
  const party: Party = { id: reg.data.client.id, email, token: reg.authToken! }
  if (profile) {
    const save = await api(`/api/clients/${party.id}/`, { method: 'PUT', token: party.token, body: { email, ...profile } })
    expect(save.status, `profile save failed: ${JSON.stringify(save.data)}`).toBe(200)
  }
  return party
}

/** A garage written straight into DynamoDB, approved or still pending, then signed in. */
export async function newGarage(prefix: string, { active = true }: { active?: boolean } = {}): Promise<Party> {
  const id = `garage-e2e-p-${unique()}`
  const email = `e2e-p-${prefix}-${unique()}@test.com`
  const now = new Date().toISOString()
  await ddb.send(new PutCommand({
    TableName: 'Garages',
    Item: {
      id,
      email,
      // Low cost factor: verification works the same, the test just runs faster.
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      companyName: `E2E P ${prefix}`,
      address: 'Οδός Δοκιμής 1, Αθήνα',
      mobile: '6900000000',
      tin: String(Date.now()).slice(-9),
      taxAuthority: 'ΔΟΥ Αθηνών',
      isActive: active,
      createdAt: now,
      updatedAt: now,
    },
  }))
  const login = await api('/api/auth/login/', { method: 'POST', body: { email, password: PASSWORD, userType: 'garage' } })
  expect(login.status, `garage login failed: ${JSON.stringify(login.data)}`).toBe(200)
  return { id, email, token: login.authToken!, user: login.data.user }
}

export const VEHICLE = {
  brand: 'Peugeot',
  model: '208',
  modelYear: '2019',
  engineCC: '1199',
  fuelType: 'petrol',
  isAutomatic: false,
  is4x4: false,
  isTurbo: true,
}

/** A request with the identifying vehicle fields filled in, so a leak has something to leak. */
export async function newRequest(
  client: Party,
  ids: { licensePlate: string; vinNumber: string; engineNumber: string },
  description = 'E2E privacy'
): Promise<{ requestId: string; vehicleId: string }> {
  const res = await api('/api/service-request/', {
    method: 'POST',
    token: client.token,
    body: { clientId: client.id, category: 'allagi-ladion', description, ...VEHICLE, ...ids },
  })
  expect(res.status, `service request failed: ${JSON.stringify(res.data)}`).toBe(200)
  return { requestId: res.data.serviceRequestId, vehicleId: res.data.vehicleId }
}

/**
 * The parts of a request the submit flow writes on later calls, set directly:
 * an άδεια key (presigned on read, never fetched) and the estimate the client saw.
 */
export async function decorateRequest(requestId: string, vehicleId: string, estimatedCost: number) {
  await ddb.send(new UpdateCommand({
    TableName: 'Vehicles',
    Key: { id: vehicleId },
    UpdateExpression: 'SET licensePhotoUrl = :k',
    ExpressionAttributeValues: { ':k': `license-photos/e2e-p/${vehicleId}.jpg` },
  }))
  await ddb.send(new UpdateCommand({
    TableName: 'ServiceRequests',
    Key: { id: requestId },
    UpdateExpression: 'SET estimatedCost = :c',
    ExpressionAttributeValues: { ':c': estimatedCost },
  }))
}

export async function makeOffer(garage: Party, requestId: string): Promise<string> {
  const res = await api('/api/offers/', {
    method: 'POST',
    token: garage.token,
    body: { serviceRequestId: requestId, offerAmount: 150, benefits: [], availabilityDates: OFFER_DATES },
  })
  expect(res.status, `offer failed: ${JSON.stringify(res.data)}`).toBe(200)
  return res.data.offer.id
}

export async function acceptOffer(client: Party, requestId: string, offerId: string) {
  const res = await api(`/api/requests/${requestId}/accept-offer/`, {
    method: 'PATCH',
    token: client.token,
    body: { offerId, appointmentDate: OFFER_DATES[0], appointmentTime: '10:00' },
  })
  expect(res.status, `accept failed: ${JSON.stringify(res.data)}`).toBe(200)
}

/** Moves an appointment's slot into the past (request and accepted offer) so it can be closed. */
export async function ageAppointment(requestId: string, offerId: string) {
  for (const [table, id] of [['ServiceRequests', requestId], ['Offers', offerId]] as const) {
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { id },
      UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
      ExpressionAttributeValues: { ':date': athensDatePlus(-2), ':time': '09:00' },
    }))
  }
}

/** Signs a browser context in as a garage, the way the login page does. */
export async function signInGarage(page: Page, garage: Party) {
  await setAuthCookie(page, garage.token)
  await page.goto('/')
  await page.evaluate((user: Record<string, unknown>) => {
    localStorage.setItem('garageUser', JSON.stringify(user))
    localStorage.setItem('userType', 'garage')
  }, garage.user ?? {})
}

/** Every identifying field a garage must not see before it wins, wherever it sits. */
export const CLIENT_PII = ['lastName', 'phoneNumber', 'email', 'address'] as const
export const VEHICLE_PII = ['licensePlate', 'vinNumber', 'engineNumber'] as const
