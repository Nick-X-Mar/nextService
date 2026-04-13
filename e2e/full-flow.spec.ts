import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsGarage, loginAsClient, TEST_GARAGE } from './helpers'

const CLIENT_EMAIL = `e2e-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let serviceRequestId: string
let offerId: string
let garageToken: string

test.describe.serial('Full Flow: Registration → Request → Offer → Chat', () => {

  test('1. Register new client via API', async ({ request }) => {
    const result = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    expect(result.success).toBe(true)
    expect(result.client.email).toBe(CLIENT_EMAIL.toLowerCase())
    clientId = result.client.id
    console.log(`  Client registered: ${clientId}`)
  })

  test('2. Client login works', async ({ request }) => {
    const { status, data } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe(clientId)
  })

  test('3. Client creates a service request via API', async ({ request }) => {
    const { token } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')

    // Service request API creates vehicle in the same call
    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E test: αλλαγή λαδιών και φίλτρων',
        brand: 'BMW',
        model: '320i',
        modelYear: '2019',
        engineCC: '2000',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
        isTurbo: true,
        vinNumber: 'WBAPH5C55BA123456',
        engineNumber: 'N20B20A12345',
        photos: [],
      },
    })
    const srData = await srResp.json()
    expect(srData.success).toBe(true)
    serviceRequestId = srData.serviceRequestId
    console.log(`  Service request created: ${serviceRequestId}`)
  })

  test('4. Client sees the new request in dashboard (API)', async ({ request }) => {
    const { token } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/requests?clientId=${clientId}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const requests = data.requests || data
    const found = requests.find((r: { id: string }) => r.id === serviceRequestId)
    expect(found).toBeTruthy()
    expect(found.description).toContain('E2E test')
  })

  test('5. Garage sees the request via API', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    garageToken = token

    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)

    const ourRequest = data.requests.find((r: { id: string }) => r.id === serviceRequestId)
    expect(ourRequest).toBeTruthy()
    expect(ourRequest.description).toContain('E2E test')
    console.log(`  Garage can see request: ${serviceRequestId}`)
  })

  test('6. Garage available-requests API returns our request', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const found = data.requests.find((r: { id: string }) => r.id === serviceRequestId)
    expect(found).toBeTruthy()
  })

  test('7. Garage submits an offer via API', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: {
        serviceRequestId,
        offerAmount: 120,
        benefits: ['Δωρεάν έλεγχος'],
        availableDates: ['2026-04-15', '2026-04-16'],
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.offer.offerAmount).toBe(120)
    offerId = data.offer.id
    console.log(`  Offer created: ${offerId} — 120€`)
  })

  test('8. Garage sends a chat message', async ({ request }) => {
    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: {
        message: 'E2E: Καλησπέρα, σας στείλαμε προσφορά!',
        garageId: TEST_GARAGE.id,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.message.senderType).toBe('garage')
    console.log(`  Garage message sent: ${data.message.id}`)
  })

  test('9. Client replies in chat', async ({ request }) => {
    const { token } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')

    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        message: 'E2E: Ευχαριστώ, μου κάνει!',
        garageId: TEST_GARAGE.id,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.message.senderType).toBe('client')
    console.log(`  Client reply sent: ${data.message.id}`)
  })

  test('10. Chat messages retrievable via API', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/chat/${serviceRequestId}/messages?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.messages.length).toBe(2)
    expect(data.messages[0].message).toContain('Καλησπέρα')
    expect(data.messages[1].message).toContain('Ευχαριστώ')
  })

  test('11. Offer visible in garage offers (API)', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/garage/offers?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const ourOffer = data.offers.find((o: { id: string }) => o.id === offerId)
    expect(ourOffer).toBeTruthy()
    expect(ourOffer.status).toBe('pending')
    console.log(`  Offer ${offerId} is pending`)
  })

  test('12. Cleanup: cancel service request', async ({ request }) => {
    const { token } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.patch(`/api/service-request/${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${token}` },
      data: { status: 'cancelled' },
    })
    if (resp.status() === 200) {
      console.log(`  Cleaned up: ${serviceRequestId} cancelled`)
    } else {
      console.log(`  Cleanup skipped (status ${resp.status()})`)
    }
  })
})
