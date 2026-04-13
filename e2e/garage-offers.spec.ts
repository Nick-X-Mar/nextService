import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'

const CLIENT_EMAIL = `e2e-offers-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let serviceRequestId: string
let garageToken: string
let clientToken: string
let offerId: string

test.describe.serial('Garage Offers flow', () => {

  test('Setup: register client, create request', async ({ request }) => {
    // Register client
    const regResult = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = regResult.client.id

    // Get client token
    const clientLogin = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = clientLogin.token

    // Create service request
    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'frena',
        description: 'E2E offers test: αλλαγή τακάκια',
        brand: 'Toyota',
        model: 'Corolla',
        modelYear: '2021',
        engineCC: '1800',
        fuelType: 'petrol',
        isAutomatic: true,
        is4x4: false,
      },
    })
    const srData = await srResp.json()
    expect(srData.success).toBe(true)
    serviceRequestId = srData.serviceRequestId

    // Get garage token
    const garageLogin = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    garageToken = garageLogin.token
  })

  test('Offer with zero amount fails', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        serviceRequestId,
        offerAmount: 0,
      },
    })
    // Should return error — either success:false or non-200 status
    const data = await resp.json()
    expect(data.success === false || resp.status() >= 400).toBeTruthy()
  })

  test('Offer without serviceRequestId fails', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        offerAmount: 200,
      },
    })
    const data = await resp.json()
    expect(data.success === false || resp.status() >= 400).toBeTruthy()
  })

  test('Valid offer is created', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    garageToken = login.token
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        serviceRequestId,
        offerAmount: 200,
        benefits: ['Δωρεάν διαγνωστικό'],
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.offer.offerAmount).toBe(200)
    expect(data.offer.status).toBe('pending')
    offerId = data.offer.id
  })

  test('Offer appears in garage offers list', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/garage/offers?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const ourOffer = data.offers.find((o: { id: string }) => o.id === offerId)
    expect(ourOffer).toBeTruthy()
    expect(ourOffer.status).toBe('pending')
  })

  test('Offer appears in client request offers', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/offers?serviceRequestId=${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const ourOffer = data.offers?.find((o: { id: string }) => o.id === offerId)
    expect(ourOffer).toBeTruthy()
  })

  test('Offer can be updated', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.put('/api/offers', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        offerId,
        offerAmount: 180,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
  })

  test('Request no longer appears in available-requests after offer', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    const data = await resp.json()
    const found = data.requests.find((r: { id: string }) => r.id === serviceRequestId)
    // Should be filtered out since garage already made an offer
    expect(found).toBeFalsy()
  })
})
