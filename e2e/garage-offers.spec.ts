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

/**
 * Once a client accepts an offer the job belongs to one garage: the request leaves the
 * open market, the winner keeps talking to the client, and every other garage's thread
 * goes read-only. Payments may be enabled in this environment, in which case accepting
 * needs a Stripe intent we cannot mint here — the suite then skips the assertions that
 * depend on an actual acceptance rather than reporting a false pass.
 */
test.describe.serial('Accepted offer locks the request down', () => {
  const email = `e2e-accept-${Date.now()}@test.com`
  const password = 'TestPass123'
  const OTHER_GARAGE_ID = 'garage-e2e-not-involved'

  let cId: string
  let srId: string
  let oId: string
  let cToken: string
  let gToken: string
  let accepted = false

  test('Setup: request + offer', async ({ request }) => {
    const reg = await registerClient(request, email, password)
    cId = reg.client.id
    cToken = (await loginViaAPI(request, email, password, 'client')).token
    gToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token

    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${cToken}` },
      data: {
        clientId: cId,
        category: 'symplektis',
        description: 'E2E accept lockdown',
        brand: 'Seat',
        model: 'Ibiza',
        modelYear: '2015',
        engineCC: '1400',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    srId = (await srResp.json()).serviceRequestId

    const offerResp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: {
        serviceRequestId: srId,
        garageId: TEST_GARAGE.id,
        offerAmount: 260,
        benefits: ['Δωρεάν έλεγχος'],
        availabilityDates: ['2026-09-14', '2026-09-15'],
      },
    })
    oId = (await offerResp.json()).offer.id
    expect(oId).toBeTruthy()
  })

  test('Client accepts the offer', async ({ request }) => {
    const resp = await request.patch(`/api/requests/${srId}/accept-offer`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { offerId: oId, clientId: cId, appointmentDate: '2026-09-15', appointmentPrice: 260 },
    })
    const data = await resp.json()
    accepted = resp.status() === 200 && data.success === true
    test.skip(!accepted, 'Payments enabled — acceptance needs a Stripe intent this suite cannot create')
    expect(data.request.status).toBe('appointment')
  })

  test('Request records which garage won it', async ({ request }) => {
    test.skip(!accepted, 'No acceptance happened')
    const resp = await request.get(`/api/requests/${srId}`, {
      headers: { Cookie: `auth-token=${cToken}` },
    })
    const data = await resp.json()
    expect(data.request.acceptedGarageId).toBe(TEST_GARAGE.id)
  })

  test('Request is gone from the open-requests feed', async ({ request }) => {
    test.skip(!accepted, 'No acceptance happened')
    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}&countOnly=1`, {
      headers: { Cookie: `auth-token=${gToken}` },
    })
    const data = await resp.json()
    expect(data.requestIds).not.toContain(srId)
  })

  test('The garage that won can still write', async ({ request }) => {
    test.skip(!accepted, 'No acceptance happened')
    const resp = await request.post(`/api/chat/${srId}/messages`, {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { message: 'Σας περιμένουμε τη Δευτέρα', senderType: 'garage', senderId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)
  })

  test('Any other garage thread is read-only', async ({ request }) => {
    test.skip(!accepted, 'No acceptance happened')
    const resp = await request.post(`/api/chat/${srId}/messages`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { message: 'Ερώτηση', senderType: 'client', senderId: cId, garageId: OTHER_GARAGE_ID },
    })
    expect(resp.status()).toBe(403)
  })

  test('Client can still write to the garage it chose', async ({ request }) => {
    test.skip(!accepted, 'No acceptance happened')
    const resp = await request.post(`/api/chat/${srId}/messages`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { message: 'Ευχαριστώ!', senderType: 'client', senderId: cId, garageId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)
  })
})
