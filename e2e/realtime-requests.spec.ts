import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import {
  isAppSyncMockReachable,
  publishOverHttpAs,
  realtimeTokenFor,
  requestRealtimeToken,
  subscribeToChannels,
  tryPublish,
  trySubscribe,
} from './appsync-helpers'
import { loginAdmin, newClient, newGarage, newRequest } from './E-helpers'
import { adminPost, adminSession } from './a-helpers'

// The realtime fan-out hangs off the local AppSync mock (port 3002). Without
// it the broadcast never happens, so guard the suite with a health check —
// CI may have only the dev server running.
test.beforeAll(async () => {
  const ok = await isAppSyncMockReachable()
  test.skip(!ok, 'Local AppSync mock not reachable on http://localhost:3002 — skipping realtime suite')
})

const CLIENT_EMAIL = `e2e-realtime-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let clientToken: string
let garageToken: string

test.describe.serial('Realtime new-request broadcasts', () => {

  test('Setup: register client and login both roles', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id

    const clientLogin = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = clientLogin.token

    const garageLogin = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    garageToken = garageLogin.token

    expect(clientToken).toBeTruthy()
    expect(garageToken).toBeTruthy()
  })

  test('POST /api/service-request publishes new-request on AppSync', async ({ request }) => {
    const sub = await subscribeToChannels(['new-requests'])
    try {
      const resp = await request.post('/api/service-request', {
        headers: { Cookie: `auth-token=${clientToken}` },
        data: {
          clientId,
          category: 'symplektis',
          description: 'Realtime broadcast test',
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
      const data = await resp.json()
      const requestId: string = data.serviceRequestId
      expect(requestId).toMatch(/^sr-/)

      const event = await sub.waitFor(
        e => e.channel === 'new-requests'
          && e.data.__type === 'new-request'
          && e.data.request?.id === requestId,
        8000
      )

      // Spot-check the enriched payload — garages render off this without an
      // extra fetch, so the broadcast must include client + vehicle fields.
      const broadcastRequest = event.data.request as Record<string, unknown>
      expect(broadcastRequest).toMatchObject({
        id: requestId,
        category: 'symplektis',
        status: 'pending',
      })
      expect(broadcastRequest.client).toBeTruthy()
      expect(broadcastRequest.vehicle).toMatchObject({ brand: 'Toyota', model: 'Yaris' })
    } finally {
      sub.close()
    }
  })

  test('Subscribers on chat channels do NOT receive new-request payloads', async ({ request }) => {
    // Cross-channel isolation: a garage that only subscribed to a chat room
    // shouldn't see new-request events leak into its callback. The AppSync
    // mock filters by roomId on the server side, so this is a regression
    // guard against the multi-subscriber refactor.
    const chatChannel = `request-isolation-test-garage-${TEST_GARAGE.id}`
    const sub = await subscribeToChannels([chatChannel])
    try {
      const resp = await request.post('/api/service-request', {
        headers: { Cookie: `auth-token=${clientToken}` },
        data: {
          clientId,
          category: 'allagi-ladion',
          description: 'Should not leak to chat channels',
          brand: 'Mazda',
          model: '3',
          modelYear: '2018',
          engineCC: '1500',
          fuelType: 'petrol',
          isAutomatic: false,
          is4x4: false,
        },
      })
      expect(resp.status()).toBe(200)

      // Give the broadcast a chance to fire and (incorrectly) reach us.
      await new Promise(r => setTimeout(r, 1500))

      const leaked = sub.events.find(e => e.data.__type === 'new-request')
      expect(leaked, 'new-request event leaked to a chat channel').toBeFalsy()
    } finally {
      sub.close()
    }
  })

  test('Multiple subscribers all receive the broadcast', async ({ request }) => {
    // Two independent connections subscribe to new-requests; both must see
    // the same event so the dashboard's "always-on" hook and the
    // AvailableRequests list-level hook can coexist.
    const subA = await subscribeToChannels(['new-requests'])
    const subB = await subscribeToChannels(['new-requests'])
    try {
      const resp = await request.post('/api/service-request', {
        headers: { Cookie: `auth-token=${clientToken}` },
        data: {
          clientId,
          category: 'allagi-ladion',
          description: 'Multi-subscriber broadcast test',
          brand: 'Nissan',
          model: 'Micra',
          modelYear: '2020',
          engineCC: '1000',
          fuelType: 'petrol',
          isAutomatic: false,
          is4x4: false,
        },
      })
      expect(resp.status()).toBe(200)
      const requestId = (await resp.json()).serviceRequestId

      const matcher = (e: { data: { __type?: string; request?: { id?: string } } }) =>
        e.data.__type === 'new-request' && e.data.request?.id === requestId

      const [evA, evB] = await Promise.all([
        subA.waitFor(matcher, 8000),
        subB.waitFor(matcher, 8000),
      ])
      expect(evA.data.request?.id).toBe(requestId)
      expect(evB.data.request?.id).toBe(requestId)
    } finally {
      subA.close()
      subB.close()
    }
  })
})

test.describe.serial('Realtime request-update broadcasts', () => {

  let updateClientId: string
  let updateClientToken: string

  test('Setup: separate client for update tests', async ({ request }) => {
    const email = `e2e-realtime-upd-${Date.now()}@test.com`
    const reg = await registerClient(request, email, 'TestPass123')
    updateClientId = reg.client.id
    const login = await loginViaAPI(request, email, 'TestPass123', 'client')
    updateClientToken = login.token
  })

  test('Admin cancel publishes request-update with CANCELLED', async ({ request }) => {
    // Create a fresh PENDING request that an admin can cancel without
    // tripping the appointment-only guard on the client cancel route.
    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${updateClientToken}` },
      data: {
        clientId: updateClientId,
        category: 'frena',
        description: 'Admin cancel broadcast test',
        brand: 'Ford',
        model: 'Fiesta',
        modelYear: '2016',
        engineCC: '1100',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(srResp.status()).toBe(200)
    const requestId = (await srResp.json()).serviceRequestId

    // The admin routes take the admin session, not a client's auth-token. This
    // test used to send the client's cookie, get a 401 and skip itself — so
    // it never once checked the broadcast.
    const adminCookie = await loginAdmin(request)

    const sub = await subscribeToChannels(['request-updates'])
    try {
      const cancelResp = await request.patch(`/api/admin/requests/${requestId}/cancel/`, {
        headers: { Cookie: adminCookie },
      })
      expect(cancelResp.status()).toBe(200)

      const event = await sub.waitFor(
        e => e.channel === 'request-updates'
          && e.data.__type === 'request-update'
          && e.data.requestId === requestId,
        8000
      )
      expect(event.data.status?.toLowerCase()).toBe('cancelled')
    } finally {
      sub.close()
    }
  })
})

// Smoke test that exercises the same wire format the client uses, so it would
// catch a regression in either the local mock or the broadcast helper
// payload shape. Doesn't require running API routes.
test('AppSync mock round-trips a manual publish to the new-requests channel', async () => {
  const sub = await subscribeToChannels(['new-requests'])
  try {
    const sentinel: Record<string, unknown> = {
      __type: 'new-request',
      request: { id: 'sr-roundtrip-test', category: 'allagi-ladion', status: 'pending' },
    }
    // The mock exposes a /publish helper for exactly this kind of test.
    const res = await fetch('http://localhost:3002/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: 'new-requests', message: sentinel }),
    })
    expect(res.ok).toBe(true)

    const event = await sub.waitFor(
      e => e.channel === 'new-requests' && e.data.request?.id === 'sr-roundtrip-test',
      3000
    )
    expect(event.data.__type).toBe('new-request')
  } finally {
    sub.close()
  }
})

/**
 * Who may do what on the realtime API. The production authorizer
 * (infra/lambdas/appsync-authorizer) and the mock enforce the same rules; the
 * mock is what these exercise.
 *
 * Before: the authorizer looked at the channel only, never the operation. Any
 * approved garage could PUBLISH on `request-updates` — dropping requests off
 * every competitor's live dashboard — or forge events into its own threads;
 * a deactivated garage kept a token and kept receiving its threads live; and a
 * frame that named no channel was waved through as if it were the connect.
 */
test.describe.serial('Realtime authorization', () => {
  test('A garage token cannot publish — not on the broadcast channels, not on its own thread', async ({ request }) => {
    const garage = await newGarage(request, { prefix: 'rt-forge' })
    const token = await realtimeTokenFor(garage.token)
    const thread = `request-sr-e2e-forge-${Date.now()}-garage-${garage.id}`
    const listener = await subscribeToChannels(['request-updates', 'new-requests', thread], { token })
    try {
      // Listening on all three, so "nothing arrived" below means something.
      await expect.poll(() => listener.events.filter((e) => e.data.status === 'subscribed').length).toBe(3)
      const forged = { __type: 'request-update', requestId: `sr-e2e-forged-${Date.now()}`, status: 'cancelled' }
      expect(await tryPublish('request-updates', forged, token)).toBe('refused')
      expect(await tryPublish('new-requests', { __type: 'new-request', request: { id: forged.requestId } }, token)).toBe('refused')
      expect(await tryPublish(thread, { id: 'forged', message: 'forged', senderType: 'client' }, token)).toBe('refused')
      // The HTTP path the app server uses refuses a garage token just the same.
      expect(await publishOverHttpAs(token, 'request-updates', forged)).toBe(401)

      await new Promise((r) => setTimeout(r, 500))
      const leaked = listener.events.filter((e) => e.channel !== undefined)
      expect(leaked, 'a forged event reached a subscriber').toEqual([])
    } finally {
      listener.close()
    }
  })

  test('A client token cannot publish into its own conversation either', async ({ request }) => {
    const client = await newClient(request, 'rt-forge-client')
    const requestId = await newRequest(request, client)
    const token = await realtimeTokenFor(client.token)
    const thread = `request-${requestId}-garage-${TEST_GARAGE.id}`
    expect(await trySubscribe(thread, token)).toBe('subscribed')
    expect(await tryPublish(thread, { id: 'forged', message: 'forged', senderType: 'garage' }, token)).toBe('refused')
  })

  test('A subscribe or publish that names no channel is refused', async ({ request }) => {
    const garage = await newGarage(request, { prefix: 'rt-nochannel' })
    const token = await realtimeTokenFor(garage.token)
    expect(await trySubscribe(null, token)).toBe('denied')
    expect(await tryPublish(null, { __type: 'request-update' }, token)).toBe('refused')
    // Wildcards are judged on their literal text, so they are not accepted at all.
    expect(await trySubscribe(`request-*-garage-${garage.id}`, token)).toBe('denied')
  })

  test('An inactive garage gets no realtime token, and an earlier token stops subscribing', async ({ request }) => {
    const pending = await newGarage(request, { active: false, prefix: 'rt-pending' })
    const refused = await requestRealtimeToken(pending.token)
    expect(refused.status).toBe(403)
    expect(refused.data.code).toBe('GARAGE_INACTIVE')

    // Approved, takes a token, then is deactivated while the token still lives.
    const garage = await newGarage(request, { prefix: 'rt-deactivated' })
    const token = await realtimeTokenFor(garage.token)
    const thread = `request-sr-e2e-deactivated-${Date.now()}-garage-${garage.id}`
    expect(await trySubscribe(thread, token)).toBe('subscribed')

    const admin = await adminSession()
    expect(await adminPost(`/api/admin/users/garages/${garage.id}/deactivate/`, admin)).toBe(200)

    expect((await requestRealtimeToken(garage.token)).status).toBe(403)
    expect(await trySubscribe(thread, token)).toBe('denied')
    expect(await trySubscribe('new-requests', token)).toBe('denied')
    expect(await trySubscribe('request-updates', token)).toBe('denied')

    // Clients are unaffected by the garage gate.
    const client = await newClient(request, 'rt-client-token')
    expect((await requestRealtimeToken(client.token)).status).toBe(200)
  })

  // The app server's own publishes go to :3002 whatever APPSYNC_MOCK_PORT says.
  test("The app server's system publish still reaches the thread", async ({ request }) => {
    const garage = await newGarage(request, { prefix: 'rt-system' })
    const client = await newClient(request, 'rt-system')
    const requestId = await newRequest(request, client)
    const thread = `request-${requestId}-garage-${garage.id}`
    const listener = await subscribeToChannels([thread], { token: await realtimeTokenFor(garage.token) })
    try {
      const body = `system publish probe ${Date.now()}`
      const resp = await request.post(`/api/chat/${requestId}/messages/`, {
        headers: { Cookie: `auth-token=${garage.token}` },
        data: { message: body, garageId: garage.id },
      })
      expect(resp.status()).toBe(200)
      const event = await listener.waitFor((e) => e.channel === thread && e.data?.message === body, 8000)
      expect(event.data.senderType).toBe('garage')
    } finally {
      listener.close()
    }
  })
})
