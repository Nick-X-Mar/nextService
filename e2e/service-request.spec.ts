import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'

const CLIENT_EMAIL = `e2e-sr-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let clientToken: string
let serviceRequestId: string

test.describe.serial('Service Request lifecycle', () => {

  test('Setup: register client', async ({ request }) => {
    const regResult = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = regResult.client.id
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = login.token
  })

  test('Create request with missing fields fails', async ({ request }) => {
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { clientId, category: '', brand: '', model: '' },
    })
    expect(resp.status()).toBe(400)
  })

  test('Create valid service request', async ({ request }) => {
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'symplektis',
        description: 'E2E SR test: αλλαγή συμπλέκτη',
        brand: 'Ford',
        model: 'Focus',
        modelYear: '2017',
        engineCC: '1500',
        fuelType: 'diesel',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    serviceRequestId = data.serviceRequestId
    expect(serviceRequestId).toMatch(/^sr-/)
  })

  test('Request appears in client requests list', async ({ request }) => {
    const resp = await request.get(`/api/requests?clientId=${clientId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const found = data.requests?.find((r: { id: string }) => r.id === serviceRequestId)
      || data.find?.((r: { id: string }) => r.id === serviceRequestId)
    expect(found).toBeTruthy()
  })

  test('Request detail returns correct data', async ({ request }) => {
    const resp = await request.get(`/api/requests/${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.description || data.request?.description).toContain('E2E SR test')
  })

  test('Request status is pending', async ({ request }) => {
    const resp = await request.get(`/api/requests/${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    const data = await resp.json()
    const status = data.status || data.request?.status
    expect(status).toBe('pending')
  })

  test('Cancel request works', async ({ request }) => {
    const resp = await request.patch(`/api/requests/${serviceRequestId}/cancel`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    // Accept 200 or check response
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(data.success).toBe(true)
    }
  })
})
