import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'

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
