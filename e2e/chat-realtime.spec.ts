import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { subscribeToChannels, isAppSyncMockReachable, type Subscription } from './appsync-helpers'

/**
 * Regression cover for the bug that made real-time chat look browser-specific.
 *
 * Server-side publishing went through the browser `WebSocket` constructor,
 * which is not a global in Node 20. Every publish threw `ReferenceError` and
 * the catch swallowed it, so no chat message ever reached AppSync and the
 * feature was carried entirely by each page's client-side fallback — which is
 * why it behaved differently in Safari and Firefox than in Chrome.
 *
 * These tests assert the message actually lands on the wire.
 */

const CLIENT_EMAIL = `e2e-chatrt-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let requestId: string
let clientToken: string
let garageToken: string
let sub: Subscription | null = null

test.describe.serial('Chat realtime publishing', () => {
  test.beforeAll(async () => {
    const reachable = await isAppSyncMockReachable()
    test.skip(!reachable, 'AppSync mock is not running (npm run mock-appsync)')
  })

  test.afterAll(() => {
    sub?.close()
  })

  test('Setup: client, request and both logins', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id

    clientToken = (await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')).token
    garageToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
    expect(clientToken).toBeTruthy()
    expect(garageToken).toBeTruthy()

    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E chat realtime',
        brand: 'Toyota',
        model: 'Yaris',
        modelYear: '2019',
        engineCC: '1300',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(resp.status()).toBe(200)
    requestId = (await resp.json()).serviceRequestId
    expect(requestId).toMatch(/^sr-/)
  })

  test('A garage message is published to the thread channel', async ({ request }) => {
    const channel = `request-${requestId}-garage-${TEST_GARAGE.id}`
    sub = await subscribeToChannels([channel])

    const body = `Γεια σας — realtime probe ${Date.now()}`
    const resp = await request.post(`/api/chat/${requestId}/messages/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { message: body, garageId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)

    const event = await sub.waitFor((e) => e.data?.message === body, 8000)
    expect(event.channel).toBe(channel)
    expect(event.data.senderType).toBe('garage')
    expect(event.data.id).toBeTruthy()
  })

  test('A client reply is published to the same channel', async ({ request }) => {
    const body = `Καλημέρα — client probe ${Date.now()}`
    const resp = await request.post(`/api/chat/${requestId}/messages/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { message: body, senderId: clientId, senderType: 'client', garageId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)

    const event = await sub!.waitFor((e) => e.data?.message === body, 8000)
    expect(event.data.senderType).toBe('client')
  })

  test('The POST response carries the created row, so the sender can render it without the echo', async ({ request }) => {
    const body = `Optimistic probe ${Date.now()}`
    const resp = await request.post(`/api/chat/${requestId}/messages/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { message: body, garageId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    // This is what both chat pages append optimistically. Without an id or a
    // timestamp the append is dropped and the message vanishes until reload.
    expect(data.message?.id).toBeTruthy()
    expect(data.message?.timestamp).toBeTruthy()
    expect(data.message?.message).toBe(body)
  })

  test('A full page of this garage thread survives other garages sharing the request', async ({ request }) => {
    // The messages GET reads a GSI partitioned by requestId and filters to one
    // garage AFTER applying Limit, so a busy request used to return a nearly
    // empty page while still reporting more to come.
    const resp = await request.get(
      `/api/chat/${requestId}/messages/?garageId=${TEST_GARAGE.id}&limit=10`,
      { headers: { Cookie: `auth-token=${garageToken}` } }
    )
    expect(resp.status()).toBe(200)
    expect(resp.headers()['cache-control']).toContain('no-store')

    const data = await resp.json()
    expect(Array.isArray(data.messages)).toBe(true)
    // Three messages were sent above; all three belong to this thread.
    expect(data.messages.length).toBeGreaterThanOrEqual(3)
    for (const m of data.messages) {
      expect(m.id).toBeTruthy()
      expect(m.timestamp).toBeTruthy()
    }
  })
})
