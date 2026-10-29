import { expect, type APIRequestContext, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { registerClient, loginViaAPI, setAuthCookie } from './helpers'
import { athensToday } from '../src/utils/athensTime'
import { TABLES } from '../src/lib/tables'

/**
 * Fixtures for the chat, notification and broadcast specs.
 *
 * The read-only and unread rules are about *several* garages on one request,
 * and the shared TEST_GARAGE carries every job every other spec ever booked —
 * its alert list is never in a known state. So these build throwaway garages
 * straight into local DynamoDB (approved or pending), and drive everything
 * else through the real API.
 *
 * Local only: DynamoDB Local with dummy credentials.
 */

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

export const PASSWORD = 'TestPass123'

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** An Athens calendar date `days` from today. */
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
  const email = `e2e-${prefix}-${unique()}@test.com`
  const reg = await registerClient(request, email, PASSWORD)
  expect(reg.client?.id, `registration failed: ${JSON.stringify(reg)}`).toBeTruthy()
  const { token } = await loginViaAPI(request, email, PASSWORD, 'client')
  return { clientId: reg.client.id, token, email }
}

export interface TestGarage {
  id: string
  email: string
  token: string
  user: Record<string, unknown>
}

/** A garage written straight into DynamoDB, approved or still pending, then logged in. */
export async function newGarage(
  request: APIRequestContext,
  { active = true, prefix = 'garage' }: { active?: boolean; prefix?: string } = {}
): Promise<TestGarage> {
  const id = `garage-e2e-${unique()}`
  const email = `e2e-${prefix}-${unique()}@test.com`
  const now = new Date().toISOString()
  await ddb.send(new PutCommand({
    TableName: TABLES.Garages,
    Item: {
      id,
      email,
      // Low cost factor: verification works the same, the test just runs faster.
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      companyName: `E2E Συνεργείο ${prefix}`,
      address: 'Οδός Δοκιμής 1, Αθήνα',
      isActive: active,
      createdAt: now,
      updatedAt: now,
    },
  }))
  const login = await loginViaAPI(request, email, PASSWORD, 'garage')
  expect(login.status, `garage login failed: ${JSON.stringify(login.data)}`).toBe(200)
  return { id, email, token: login.token, user: login.data.user }
}

export function cookie(token: string) {
  return { Cookie: `auth-token=${token}` }
}

/** The admin session cookie, the way admin-content.spec logs in. */
export async function loginAdmin(request: APIRequestContext): Promise<string> {
  const resp = await request.post('/api/admin/auth/login/', {
    data: {
      email: process.env.ADMIN_EMAIL || 'admin@nextservice.gr',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    },
  })
  expect(resp.status(), 'admin login failed — run scripts/seed-admin.ts').toBe(200)
  const match = (resp.headers()['set-cookie'] || '').match(/ns-admin-session=([^;]+)/)
  expect(match).toBeTruthy()
  return `ns-admin-session=${match![1]}`
}

export async function newRequest(
  request: APIRequestContext,
  client: TestClient,
  vehicle: { brand: string; model: string } = { brand: 'Skoda', model: 'Octavia' }
): Promise<string> {
  const resp = await request.post('/api/service-request', {
    headers: cookie(client.token),
    data: {
      clientId: client.clientId,
      category: 'allagi-ladion',
      description: 'E2E chat/alerts',
      brand: vehicle.brand,
      model: vehicle.model,
      modelYear: '2019',
      engineCC: '1400',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
    },
  })
  expect(resp.status()).toBe(200)
  return (await resp.json()).serviceRequestId
}

export const OFFER_DATES = [athensDatePlus(20), athensDatePlus(21)]

export async function makeOffer(request: APIRequestContext, garage: TestGarage, requestId: string): Promise<string> {
  const resp = await request.post('/api/offers', {
    headers: cookie(garage.token),
    data: { serviceRequestId: requestId, offerAmount: 150, benefits: [], availabilityDates: OFFER_DATES },
  })
  expect(resp.status(), `offer failed: ${await resp.text()}`).toBe(200)
  return (await resp.json()).offer.id
}

export async function acceptOffer(request: APIRequestContext, client: TestClient, requestId: string, offerId: string) {
  const resp = await request.patch(`/api/requests/${requestId}/accept-offer/`, {
    headers: cookie(client.token),
    data: { offerId, appointmentDate: OFFER_DATES[0], appointmentTime: '10:00' },
  })
  expect(resp.status(), `accept failed: ${await resp.text()}`).toBe(200)
}

export async function postMessage(
  request: APIRequestContext,
  token: string,
  requestId: string,
  message: string,
  garageId?: string
) {
  return request.post(`/api/chat/${requestId}/messages/`, {
    headers: cookie(token),
    data: { message, ...(garageId ? { garageId } : {}) },
  })
}

/**
 * Writes a chat row directly — for a garage the API (correctly) will not let
 * write, or for the shapes the API no longer produces: leave out `garageId`
 * for a client row from before per-garage threads.
 */
export async function insertMessage(row: {
  requestId: string
  senderId: string
  senderType: 'client' | 'garage'
  garageId?: string
  message: string
  senderName?: string
}) {
  const now = new Date().toISOString()
  await ddb.send(new PutCommand({
    TableName: TABLES.ChatMessages,
    Item: { id: `msg-e2e-${unique()}`, senderName: 'E2E', timestamp: now, createdAt: now, ...row },
  }))
}

/** Registration takes no name; the winner-only name rule needs one. */
export async function setClientName(clientId: string, firstName: string, lastName: string) {
  await ddb.send(new UpdateCommand({
    TableName: TABLES.Clients,
    Key: { id: clientId },
    UpdateExpression: 'SET firstName = :f, lastName = :l',
    ExpressionAttributeValues: { ':f': firstName, ':l': lastName },
  }))
}

/** An admin's deactivation, without the admin UI. */
export async function setGarageActive(garageId: string, isActive: boolean) {
  await ddb.send(new UpdateCommand({
    TableName: TABLES.Garages,
    Key: { id: garageId },
    UpdateExpression: 'SET isActive = :a',
    ExpressionAttributeValues: { ':a': isActive },
  }))
}

/** EmailLogs rows addressed to one recipient for one template (local mail is logged as `skipped`). */
export async function emailsTo(to: string, templateName: string): Promise<Record<string, unknown>[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLES.EmailLogs,
    IndexName: 'RecipientIndex',
    KeyConditionExpression: '#to = :to',
    FilterExpression: 'templateName = :t',
    ExpressionAttributeNames: { '#to': 'to' },
    ExpressionAttributeValues: { ':to': to, ':t': templateName },
  }))
  return res.Items ?? []
}

/** Moves an appointment's slot into the past (request and accepted offer) so it can be closed. */
export async function ageAppointment(requestId: string, offerId: string, daysAgo = 2): Promise<string> {
  const date = athensDatePlus(-daysAgo)
  for (const [table, id] of [[TABLES.ServiceRequests, requestId], [TABLES.Offers, offerId]] as const) {
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { id },
      UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
      ExpressionAttributeValues: { ':date': date, ':time': '09:00' },
    }))
  }
  return date
}

export async function completeJob(request: APIRequestContext, garage: TestGarage, requestId: string) {
  const resp = await request.post(`/api/requests/${requestId}/complete/`, {
    headers: cookie(garage.token),
    data: { outcome: 'completed', amount: 186, vatIncluded: true },
  })
  expect(resp.status(), `complete failed: ${await resp.text()}`).toBe(200)
}

export interface Summary {
  threads: number
  openThreads: number
  appointmentThreads: number
  availableRequests: number
  availableRequestIds: string[]
  offersNeedingAttention: number
  alerts: { id: string; kind: string; title: string; detail?: string; href: string }[]
}

export async function summary(request: APIRequestContext, token: string): Promise<Summary> {
  const resp = await request.get('/api/notifications/summary/', { headers: cookie(token) })
  expect(resp.status()).toBe(200)
  return resp.json()
}

/**
 * Polls the summary until `predicate` holds. It is cached per user for 45s;
 * the routes that change it invalidate the entry, but a fixture written
 * straight into DynamoDB (or a route owned elsewhere that does not invalidate)
 * has to wait the window out.
 */
export async function summaryUntil(
  request: APIRequestContext,
  token: string,
  predicate: (s: Summary) => boolean,
  timeoutMs = 60_000
): Promise<Summary> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const s = await summary(request, token)
    if (predicate(s) || Date.now() > deadline) return s
    await new Promise((r) => setTimeout(r, 2000))
  }
}

/** Signs a browser context in as one of these garages, the way the login page does. */
export async function signInGarage(page: Page, garage: TestGarage) {
  await setAuthCookie(page, garage.token)
  await page.goto('/')
  await page.evaluate((user: Record<string, unknown>) => {
    localStorage.setItem('garageUser', JSON.stringify(user))
    localStorage.setItem('userType', 'garage')
  }, garage.user)
}
