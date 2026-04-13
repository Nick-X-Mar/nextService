import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'

const CLIENT_EMAIL = `e2e-profile-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let clientToken: string

test.describe.serial('Client Profile & Vehicles', () => {

  test('Setup: register client', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = login.token
  })

  test('GET client profile', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/clients/${clientId}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.client.email).toBe(CLIENT_EMAIL.toLowerCase())
  })

  test('PUT client profile update', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.put(`/api/clients/${clientId}`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        email: CLIENT_EMAIL,
        firstName: 'Γιώργος',
        lastName: 'Τεστ',
        phoneNumber: '6971234567',
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.client.firstName).toBe('Γιώργος')
    expect(data.client.lastName).toBe('Τεστ')
  })

  test('Cannot update another client profile', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.put('/api/clients/client-fake-id', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { email: 'hacker@test.com', firstName: 'Hacker' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(403)
  })

  test('Create service request to get a vehicle', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E profile test',
        brand: 'Opel',
        model: 'Corsa',
        modelYear: '2016',
        engineCC: '1400',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
        vinNumber: 'W0L000000Y1234567',
      },
    })
    expect(resp.status()).toBe(200)
  })

  test('GET client vehicles', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/clients/${clientId}/vehicles`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const vehicles = data.vehicles || data
    expect(vehicles.length).toBeGreaterThanOrEqual(1)
    const opel = vehicles.find((v: { brand: string }) => v.brand === 'Opel')
    expect(opel).toBeTruthy()
    expect(opel.model).toBe('Corsa')
  })
})
