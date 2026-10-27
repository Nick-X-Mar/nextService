import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { athensDatePlus } from './d-helpers'
import { getOffer, getServiceRequest } from './dynamo-helpers'

const CLIENT_EMAIL = `e2e-pay-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'
const APPOINTMENT_DATE = athensDatePlus(21)

let clientId: string
let serviceRequestId: string
let offerId: string
/** Learnt from the first accept: this env either demands a deposit or does not. */
let paymentsEnabled: boolean | null = null

test.describe.serial('Payments & Cancellation flow', () => {

  test('Setup: register client, create request, garage makes offer', async ({ request }) => {
    // Register client
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id

    // Create service request
    const clientLogin = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientLogin.token}` },
      data: {
        clientId,
        category: 'frena',
        description: 'E2E payment test',
        brand: 'Mercedes',
        model: 'C200',
        modelYear: '2020',
        engineCC: '2000',
        fuelType: 'petrol',
        isAutomatic: true,
        is4x4: false,
      },
    })
    serviceRequestId = (await srResp.json()).serviceRequestId

    // Garage makes offer
    const garageLogin = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const offerResp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${garageLogin.token}` },
      data: {
        serviceRequestId,
        offerAmount: 300,
        benefits: ['Εγγύηση 1 έτος'],
        availabilityDates: [APPOINTMENT_DATE],
      },
    })
    const offerData = await offerResp.json()
    expect(offerData.success).toBe(true)
    offerId = offerData.offer.id
  })

  test('Cannot cancel a pending request (only appointment)', async ({ request }) => {
    // Runs before any accept, so the request really is still pending here.
    expect((await getServiceRequest(serviceRequestId))?.status).toBe('pending')

    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.patch(`/api/requests/${serviceRequestId}/cancel`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(409)
    expect((await getServiceRequest(serviceRequestId))?.status).toBe('pending')
  })

  test('Accept offer without paymentIntentId fails when payments enabled', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.patch(`/api/requests/${serviceRequestId}/accept-offer`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        offerId,
        appointmentDate: APPOINTMENT_DATE,
      },
    })
    const data = await resp.json()
    paymentsEnabled = resp.status() !== 200
    if (paymentsEnabled) {
      // A deposit is required, so nothing may have been booked.
      expect(resp.status()).toBe(400)
      expect((await getServiceRequest(serviceRequestId))?.status).toBe('pending')
    } else {
      expect(data.request.status).toBe('appointment')
      // The price is the offer's, whatever the client sent.
      expect(data.request.appointmentPrice).toBe(300)
    }
  })

  test('Accept offer with fake paymentIntentId fails', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.patch(`/api/requests/${serviceRequestId}/accept-offer`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        offerId,
        appointmentDate: APPOINTMENT_DATE,
        paymentIntentId: 'pi_fake_12345',
      },
    })
    if (paymentsEnabled) {
      // Stripe rejects the fake intent.
      expect(resp.status()).toBeGreaterThanOrEqual(400)
    } else {
      // Payments are off, so the previous step already booked it — a second
      // accept on a booked request is a conflict, not a re-booking.
      expect(resp.status()).toBe(409)
    }
  })

  test('Wallet balance starts at 0', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get('/api/wallet/balance', {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.points).toBe(0)
  })

  test('Wallet transactions empty initially', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get('/api/wallet/transactions', {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.transactions.length).toBe(0)
  })

  test('Cancelling the appointment closes the request and the accepted offer', async ({ request }) => {
    test.skip(paymentsEnabled !== false, 'needs the booking made with payments off')

    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.patch(`/api/requests/${serviceRequestId}/cancel`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await getServiceRequest(serviceRequestId))?.status).toBe('cancelled')
    expect((await getOffer(offerId))?.status).toBe('rejected')

    // And it is final: a second cancel finds nothing to cancel.
    const again = await request.patch(`/api/requests/${serviceRequestId}/cancel`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(again.status()).toBe(409)
  })

  test('Wallet requires auth', async ({ request }) => {
    const resp = await request.get('/api/wallet/balance')
    expect(resp.status()).toBe(401)
  })
})
