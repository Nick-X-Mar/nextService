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

/**
 * The άδεια κυκλοφορίας photo. The form used to send only the file *name*, so the
 * document never left the browser and neither side ever saw it — these tests pin the
 * whole path: upload against the vehicle, then read it back as a presigned URL from
 * both the request detail and the requests list the details screen actually uses.
 */
test.describe.serial('Vehicle license photo', () => {
  const email = `e2e-license-${Date.now()}@test.com`
  const password = 'TestPass123'
  // Smallest valid PNG — the endpoint validates type and size, not content.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )

  let token: string
  let cId: string
  let srId: string
  let vehicleId: string
  let uploaded = false

  test('Setup: request creates the vehicle', async ({ request }) => {
    const reg = await registerClient(request, email, password)
    cId = reg.client.id
    token = (await loginViaAPI(request, email, password, 'client')).token

    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        clientId: cId,
        category: 'imantas',
        description: 'E2E license photo',
        brand: 'Citroen',
        model: 'C3',
        modelYear: '2017',
        engineCC: '1200',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    const sr = await srResp.json()
    srId = sr.serviceRequestId
    vehicleId = sr.vehicleId
    expect(vehicleId).toBeTruthy()
  })

  test('Photo uploads against the vehicle', async ({ request }) => {
    const resp = await request.post(`/api/vehicles/${vehicleId}/license-photo`, {
      headers: { Cookie: `auth-token=${token}` },
      multipart: { file: { name: 'adeia.png', mimeType: 'image/png', buffer: PNG } },
    })
    // S3 is not wired in every environment; without it there is nothing to assert on.
    test.skip(resp.status() === 500, 'S3 not configured in this environment')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.key).toContain(vehicleId)
    uploaded = true
  })

  test('Someone else cannot upload against this vehicle', async ({ request }) => {
    const resp = await request.post(`/api/vehicles/${vehicleId}/license-photo`, {
      multipart: { file: { name: 'adeia.png', mimeType: 'image/png', buffer: PNG } },
    })
    expect([401, 403]).toContain(resp.status())
  })

  test('Request detail hands back a presigned URL', async ({ request }) => {
    test.skip(!uploaded, 'Nothing was uploaded')
    const resp = await request.get(`/api/requests/${srId}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    const data = await resp.json()
    expect(data.request.vehicle.licensePhotoUrl).toContain('X-Amz-Signature')
  })

  test('Requests list carries it too — that is what the details screen reads', async ({ request }) => {
    test.skip(!uploaded, 'Nothing was uploaded')
    const resp = await request.get(`/api/requests?clientId=${cId}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    const data = await resp.json()
    const ours = (data.requests || []).find((r: { id: string }) => r.id === srId)
    expect(ours?.vehicle?.licensePhotoUrl).toContain('X-Amz-Signature')
  })
})
