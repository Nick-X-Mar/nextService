import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'
import { PASSWORD, acceptOffer, cookie, makeOffer, newClient, newGarage, newRequest, postMessage, setClientName } from './E-helpers'

const CLIENT_EMAIL = `e2e-gdpr-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string

test.describe.serial('GDPR: Data Export & Account Deletion', () => {

  test('Setup: register client and create data', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id

    // Create a service request so there's data to export
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'GDPR test data',
        brand: 'Fiat',
        model: '500',
        modelYear: '2015',
        engineCC: '1200',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
  })

  test('Data export requires auth', async ({ request }) => {
    const resp = await request.post('/api/account/export', {
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(401)
  })

  test('Data export with wrong password fails', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/export', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: 'wrongpassword' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('Data export with correct password succeeds', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/export', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(200)

    const contentType = resp.headers()['content-type'] || ''
    expect(contentType).toContain('application/json')

    const data = await resp.json()
    // Export should contain profile data
    expect(data.profile || data.client).toBeTruthy()
  })

  test('Account deletion with wrong password fails', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/delete', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: 'wrongpassword' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('Account deletion with correct password succeeds', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/delete', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.summary).toBeTruthy()
    console.log(`  Deleted: ${JSON.stringify(data.summary)}`)
  })

  test('Login fails after account deletion', async ({ request }) => {
    const { status, data } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    expect(data.success).toBeFalsy()
  })
})

/** Every JSON path whose string value contains `needle` — names the leak, not just that there is one. */
function pathsContaining(value: unknown, needle: string, path = '$'): string[] {
  if (typeof value === 'string') return value.includes(needle) ? [path] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => pathsContaining(v, needle, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => pathsContaining(v, needle, `${path}.${k}`))
  }
  return []
}

test.describe('GDPR: a garage export follows the winner-only rule', () => {
  test("A garage that lost the job finds only the client's first name in its export", async ({ request }) => {
    const client = await newClient(request, 'gdpr-export')
    await setClientName(client.clientId, 'Ελένη', 'Εξαγωγοπούλου')
    const winner = await newGarage(request, { prefix: 'gdpr-winner' })
    const loser = await newGarage(request, { prefix: 'gdpr-loser' })
    const requestId = await newRequest(request, client)
    const winnerOffer = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)

    // Written while the request is open, so both rows store the full name.
    for (const garage of [loser, winner]) {
      const sent = await postMessage(request, client.token, requestId, 'Καλησπέρα, πότε μπορώ να έρθω;', garage.id)
      expect(sent.status(), await sent.text()).toBeLessThan(300)
    }
    await acceptOffer(request, client, requestId, winnerOffer)

    const exportFor = async (garage: { token: string }) => {
      const resp = await request.post('/api/account/export', {
        headers: cookie(garage.token),
        data: { password: PASSWORD },
      })
      expect(resp.status()).toBe(200)
      return resp.json()
    }
    const clientRows = (data: { chatMessages: Record<string, unknown>[] }) =>
      data.chatMessages.filter((m) => m.requestId === requestId && m.senderType === 'client')

    const lost = await exportFor(loser)
    expect(clientRows(lost).length).toBeGreaterThan(0)
    for (const m of clientRows(lost)) expect(m.senderName).toBe('Ελένη')
    // Nowhere in the export — not the chat, the emails or the activity log.
    expect(pathsContaining(lost, 'Εξαγωγοπούλου')).toEqual([])

    const won = await exportFor(winner)
    expect(clientRows(won).some((m) => String(m.senderName).includes('Εξαγωγοπούλου'))).toBe(true)
  })
})
