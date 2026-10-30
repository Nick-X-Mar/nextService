import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsGarage, TEST_GARAGE } from './helpers'
import { adminCancel, adminCookie, newClient } from './d-helpers'
import { cookie, newGarage, signInGarage } from './E-helpers'
import {
  acceptOffer,
  createRequest,
  futureDate,
  futureWeekdays,
  getOffer,
  setRequestStatus,
} from './c-helpers'

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
        category: 'symplektis',
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
        availabilityDates: [futureDate(30), futureDate(31)],
      },
    })
    oId = (await offerResp.json()).offer.id
    expect(oId).toBeTruthy()
  })

  test('Client accepts the offer', async ({ request }) => {
    const resp = await request.patch(`/api/requests/${srId}/accept-offer`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { offerId: oId, clientId: cId, appointmentDate: futureDate(31), appointmentPrice: 260 },
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

/**
 * The offer API used to take the request body at its word: no check that the
 * request existed or was still open, `status` straight from the body (so a
 * garage could file its offer as already "accepted"), any number of offers per
 * garage, past dates, and an edit that defaulted every omitted field to empty.
 */
test.describe.serial('Offer API decides what the body may not', () => {
  const email = `e2e-offer-rules-${Date.now()}@test.com`
  const password = 'TestPass123'
  const [day1, day2] = futureWeekdays(2, 10)

  let cId: string
  let cToken: string
  let gToken: string
  let openId: string
  let closedId: string
  let oId: string

  test('Setup: two requests, one of them cancelled', async ({ request }) => {
    cId = (await registerClient(request, email, password)).client.id
    cToken = (await loginViaAPI(request, email, password, 'client')).token
    gToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
    openId = await createRequest(request, cToken, cId, 'E2E offer rules (open)')
    closedId = await createRequest(request, cToken, cId, 'E2E offer rules (cancelled)')
    await setRequestStatus(closedId, 'cancelled')
  })

  test('An offer on a request that does not exist is 404', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: 'sr-does-not-exist', offerAmount: 100 },
    })
    expect(resp.status()).toBe(404)
  })

  test('An offer on a cancelled request is 409', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: closedId, offerAmount: 100 },
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('REQUEST_NOT_OPEN')
  })

  test('A date before today is refused', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: openId, offerAmount: 100, availabilityDates: ['2020-03-02', day1] },
    })
    expect(resp.status()).toBe(400)
  })

  test('A nonsensical amount is refused', async ({ request }) => {
    for (const offerAmount of [-50, '150', 10_000_000]) {
      const resp = await request.post('/api/offers', {
        headers: { Cookie: `auth-token=${gToken}` },
        data: { serviceRequestId: openId, offerAmount },
      })
      expect(resp.status(), `offerAmount ${JSON.stringify(offerAmount)}`).toBe(400)
    }
  })

  test('A status in the body is ignored — a new offer is always pending', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: {
        serviceRequestId: openId,
        offerAmount: 200,
        status: 'accepted',
        garageId: 'garage-someone-else',
        benefits: ['Δωρεάν έλεγχος'],
        availabilityDates: [day1, day2],
        availabilitySlots: { [day1]: ['09:00', '10:00'], [day2]: ['14:00'] },
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    oId = data.offer.id
    expect(data.offer.status).toBe('pending')
    expect(data.offer.garageId).toBe(TEST_GARAGE.id)

    const stored = await getOffer(oId)
    expect(stored?.status).toBe('pending')
  })

  test('A second offer by the same garage is refused', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: openId, offerAmount: 150 },
    })
    expect(resp.status()).toBe(409)
    const data = await resp.json()
    expect(data.code).toBe('OFFER_EXISTS')
    expect(data.offerId).toBe(oId)
  })

  test('Two offers racing each other still leave one', async ({ request }) => {
    const raceId = await createRequest(request, cToken, cId, 'E2E offer race')
    const send = () => request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: raceId, offerAmount: 120 },
    })
    const statuses = (await Promise.all([send(), send(), send()])).map((r) => r.status()).sort()
    expect(statuses).toEqual([200, 409, 409])
  })

  test('An edit without hours keeps the stored hours, dates and benefits', async ({ request }) => {
    const resp = await request.put('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { offerId: oId, offerAmount: 210 },
    })
    expect(resp.status()).toBe(200)

    const stored = await getOffer(oId)
    expect(stored?.offerAmount).toBe(210)
    expect(stored?.availabilityDates).toEqual([day1, day2])
    expect(stored?.availabilitySlots).toEqual({ [day1]: ['09:00', '10:00'], [day2]: ['14:00'] })
    expect(stored?.benefits).toEqual(['Δωρεάν έλεγχος'])
  })

  test('An edit with a past date is refused and changes nothing', async ({ request }) => {
    const resp = await request.put('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { offerId: oId, offerAmount: 999, availabilityDates: ['2020-03-02'] },
    })
    expect(resp.status()).toBe(400)
    expect((await getOffer(oId))?.offerAmount).toBe(210)
  })

  test('An edit cannot set the status', async ({ request }) => {
    const resp = await request.put('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { offerId: oId, offerAmount: 220, status: 'accepted' },
    })
    expect(resp.status()).toBe(200)
    expect((await getOffer(oId))?.status).toBe('pending')
  })

  test("A client cannot list a garage's offer book", async ({ request }) => {
    const byGarage = await request.get(`/api/offers?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${cToken}` },
    })
    expect(byGarage.status()).toBe(403)

    // Through a request it owns, it still sees the offers on it.
    const byRequest = await request.get(`/api/offers?serviceRequestId=${openId}`, {
      headers: { Cookie: `auth-token=${cToken}` },
    })
    expect(byRequest.status()).toBe(200)
    expect((await byRequest.json()).offers.map((o: { id: string }) => o.id)).toContain(oId)
  })

  test('Only the owning client may propose dates on an offer', async ({ request }) => {
    const otherEmail = `e2e-offer-rules-other-${Date.now()}@test.com`
    await registerClient(request, otherEmail, password)
    const otherToken = (await loginViaAPI(request, otherEmail, password, 'client')).token

    const stranger = await request.patch(`/api/offers/${oId}/client-availability`, {
      headers: { Cookie: `auth-token=${otherToken}` },
      data: { clientAvailabilityDates: [day2] },
    })
    expect(stranger.status()).toBe(403)

    const past = await request.patch(`/api/offers/${oId}/client-availability`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { clientAvailabilityDates: ['2020-03-02'] },
    })
    expect(past.status()).toBe(400)

    const owner = await request.patch(`/api/offers/${oId}/client-availability`, {
      headers: { Cookie: `auth-token=${cToken}` },
      data: { clientAvailabilityDates: [day2] },
    })
    expect(owner.status()).toBe(200)
    const stored = await getOffer(oId)
    expect(stored?.clientAvailabilityDates).toEqual([day2])
    // The garage's alert keys off this, not updatedAt — see 'The offer page' below.
    expect(typeof stored?.clientAvailabilityProposedAt).toBe('string')
  })
})

/**
 * The garage's offer page against the client's side of the same offer. Each
 * test builds its own request, offer and garage: the shared test garage's
 * pages are slow to load, and a test that leaned on an earlier one's state
 * could not be rerun on its own.
 */
test.describe('The offer page', () => {
  test("Opening the offer marks the client's dates seen; the garage's own edit does not re-raise them", async ({ page, request }) => {
    const c = await newClient(request, 'offer-dates')
    const shop = await newGarage(request, { prefix: 'offer-dates' })
    const [day1, day2] = futureWeekdays(2, 10)
    const requestId = await createRequest(request, c.token, c.clientId, 'E2E offer page: proposed dates')
    const created = await request.post('/api/offers', {
      headers: cookie(shop.token),
      data: { serviceRequestId: requestId, offerAmount: 200, availabilityDates: [day1] },
    })
    expect(created.status(), await created.text()).toBe(200)
    const oId: string = (await created.json()).offer.id
    const proposed = await request.patch(`/api/offers/${oId}/client-availability`, {
      headers: cookie(c.token),
      data: { clientAvailabilityDates: [day2] },
    })
    expect(proposed.status(), await proposed.text()).toBe(200)

    await signInGarage(page, shop)
    const seen = page.waitForResponse(
      (r) => r.url().includes('/api/notifications/seen') && r.request().postDataJSON()?.kind === 'dates',
      { timeout: 60_000 }
    )
    await page.goto(`/garage-dashboard/${shop.id}/offers/${requestId}/`)
    await expect(page.getByText('Ο πελάτης πρότεινε νέες ημερομηνίες')).toBeVisible({ timeout: 45_000 })
    const seenResponse = await seen
    expect(seenResponse.request().postDataJSON()).toEqual({ kind: 'dates', id: oId })
    expect(seenResponse.status(), await seenResponse.text()).toBe(200)

    const before = await getOffer(oId)
    expect(before?.garageSeenDatesAt).toBeTruthy()
    expect(String(before?.garageSeenDatesAt) >= String(before?.clientAvailabilityProposedAt)).toBe(true)

    // A price edit moves updatedAt but is not a new proposal.
    const edit = await request.put('/api/offers', {
      headers: cookie(shop.token),
      data: { offerId: oId, offerAmount: 230 },
    })
    expect(edit.status()).toBe(200)
    const after = await getOffer(oId)
    expect(after?.clientAvailabilityProposedAt).toBe(before?.clientAvailabilityProposedAt)
    expect(String(after?.garageSeenDatesAt) >= String(after?.clientAvailabilityProposedAt)).toBe(true)
  })

  /**
   * The page used to judge "closed" by the offer alone. An admin cancel left
   * every quote pending, so the form stayed editable and every save bounced
   * off a 409 and reloaded into the same editable form.
   */
  test('After an admin cancel the offer reads «Ακυρώθηκε» and cannot be edited', async ({ page, request }) => {
    const c = await newClient(request, 'offer-cancelled')
    const shop = await newGarage(request, { prefix: 'offer-cancelled' })
    const requestId = await createRequest(request, c.token, c.clientId, 'E2E offer page: admin cancel')
    const created = await request.post('/api/offers', {
      headers: cookie(shop.token),
      data: { serviceRequestId: requestId, offerAmount: 180, availabilityDates: futureWeekdays(1, 10) },
    })
    expect(created.status(), await created.text()).toBe(200)
    const oId: string = (await created.json()).offer.id

    const cancel = await adminCancel(request, await adminCookie(request), requestId)
    expect(cancel.status(), await cancel.text()).toBe(200)
    expect((await getOffer(oId))?.status).toBe('rejected')

    await signInGarage(page, shop)
    await page.goto(`/garage-dashboard/${shop.id}/offers/${requestId}/`)
    await expect(page.getByText('Το αίτημα ακυρώθηκε')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText('Ακυρώθηκε', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Ποσό σε €, χωρίς ΦΠΑ')).toBeDisabled()
    await expect(page.getByRole('button', { name: /Ενημέρωση Προσφοράς/ })).toHaveCount(0)
  })

  test('An offer still marked pending on a request booked elsewhere is read-only too', async ({ page, request }) => {
    const c = await newClient(request, 'offer-stale')
    const shop = await newGarage(request, { prefix: 'offer-stale' })
    const requestId = await createRequest(request, c.token, c.clientId, 'E2E offer page: stale pending')
    const created = await request.post('/api/offers', {
      headers: cookie(shop.token),
      data: { serviceRequestId: requestId, offerAmount: 180, availabilityDates: futureWeekdays(1, 10) },
    })
    const oId: string = (await created.json()).offer.id
    // What a competitor's acceptance leaves behind when its sweep of the
    // other offers reads an index that has not caught up with this one yet.
    await setRequestStatus(requestId, 'appointment')
    expect((await getOffer(oId))?.status).toBe('pending')

    await signInGarage(page, shop)
    await page.goto(`/garage-dashboard/${shop.id}/offers/${requestId}/`)
    await expect(page.getByText('Η προσφορά δεν είναι πλέον ενεργή')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText('Απορρίφθηκε', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Ποσό σε €, χωρίς ΦΠΑ')).toBeDisabled()
    await expect(page.getByRole('button', { name: /Ενημέρωση Προσφοράς/ })).toHaveCount(0)
  })
})

/**
 * An accepted offer is the appointment. Editing it used to write `status:
 * pending` back over the acceptance, which dropped the booking off the
 * garage's dashboard; and the garage's own offers list read fields that
 * Offers rows do not have, so prices showed blank and the booked hour was lost.
 */
test.describe.serial('Accepted offer is frozen and fully reported', () => {
  const email = `e2e-offer-frozen-${Date.now()}@test.com`
  const password = 'TestPass123'
  const [day] = futureWeekdays(1, 12)

  let cToken: string
  let gToken: string
  let srId: string
  let oId: string

  test('Setup: a booked appointment', async ({ request }) => {
    const cId = (await registerClient(request, email, password)).client.id
    cToken = (await loginViaAPI(request, email, password, 'client')).token
    gToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
    srId = await createRequest(request, cToken, cId, 'E2E frozen offer')

    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: {
        serviceRequestId: srId,
        offerAmount: 300,
        availabilityDates: [day],
        availabilitySlots: { [day]: ['10:00', '11:00'] },
      },
    })
    oId = (await resp.json()).offer.id
    await acceptOffer(request, { clientToken: cToken, requestId: srId, offerId: oId, date: day, time: '11:00', price: 300 })
  })

  test("The garage's offers list carries the amount and the booked hour", async ({ request }) => {
    const resp = await request.get(`/api/garage/offers?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${gToken}` },
    })
    expect(resp.status()).toBe(200)
    const offer = (await resp.json()).offers.find((o: { id: string }) => o.id === oId)
    expect(offer.status).toBe('accepted')
    expect(offer.offerAmount).toBe(300)
    expect(offer.appointmentDate).toBe(day)
    expect(offer.appointmentTime).toBe('11:00')
    expect(offer).not.toHaveProperty('price')
  })

  test('Editing an accepted offer is 409 and it stays accepted', async ({ request }) => {
    const resp = await request.put('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { offerId: oId, offerAmount: 250 },
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('OFFER_LOCKED')

    const stored = await getOffer(oId)
    expect(stored?.status).toBe('accepted')
    expect(stored?.offerAmount).toBe(300)
    expect(stored?.appointmentTime).toBe('11:00')
  })

  test('A booked request takes no new offers', async ({ request }) => {
    const resp = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gToken}` },
      data: { serviceRequestId: srId, offerAmount: 280 },
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('REQUEST_NOT_OPEN')
  })

  test('The offer page shows the booking, its hour, and no way to edit it', async ({ page, request }) => {
    await loginAsGarage(page, request)
    await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/offers/${srId}/`)
    await expect(page.getByText('Η προσφορά έχει γίνει αποδεκτή')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/, 11:00/).first()).toBeVisible()
    await expect(page.getByText('Αποδεκτή', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ενημέρωση Προσφοράς' })).toHaveCount(0)
  })
})

/**
 * The offer form, driven as a garage drives it. An untouched hour grid means
 * "every hour open" and has to be sent as exactly that — sent as nothing, the
 * client booked a day with no hour. And an hours-only edit has to count as a
 * change, or the update button never enabled for it.
 */
test.describe.serial('Offer form sends hours', () => {
  const email = `e2e-offer-form-${Date.now()}@test.com`
  const password = 'TestPass123'
  let srId: string

  test('Setup: an open request', async ({ request }) => {
    const cId = (await registerClient(request, email, password)).client.id
    const cToken = (await loginViaAPI(request, email, password, 'client')).token
    srId = await createRequest(request, cToken, cId, 'E2E offer form')
  })

  test('A new offer with the grid untouched carries every working hour', async ({ page, request }) => {
    await loginAsGarage(page, request)
    await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/offers/${srId}/`)
    await expect(page.getByRole('heading', { name: 'Νέα Προσφορά' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Δεν έχει σταλεί', { exact: true })).toBeVisible()

    await page.getByPlaceholder('Ποσό σε €, χωρίς ΦΠΑ').fill('175')
    // Any two bookable days; which ones does not matter.
    const days = page.locator('td[data-day]:not([data-disabled]):not([data-outside]):not([data-hidden]) button')
    await expect(page.locator('.rdp-month_grid')).toBeVisible()
    // Late in the month the current view can hold one bookable day or none (30
    // October: the 31st is a Saturday); a full next month always has two.
    if ((await days.count()) < 2) await page.getByRole('button', { name: 'Go to the Next Month' }).click()
    await days.nth(0).click()
    await days.nth(1).click()

    const sent = page.waitForResponse((r) => r.url().includes('/api/offers') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Αποστολή Προσφοράς' }).click()
    const body = await (await sent).json()
    expect(body.success).toBe(true)

    const stored = await getOffer(body.offer.id)
    const dates = stored?.availabilityDates as string[]
    const slots = stored?.availabilitySlots as Record<string, string[]>
    expect(dates).toHaveLength(2)
    for (const date of dates) {
      expect(slots[date]?.length, `hours for ${date}`).toBeGreaterThan(0)
    }

    // And it lands on the offers tab the dashboard actually reads.
    await expect(page).toHaveURL(/\?tab=offers/, { timeout: 20_000 })
  })

  test('Closing a single hour is an edit that can be saved', async ({ page, request }) => {
    await loginAsGarage(page, request)
    await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/offers/${srId}/`)
    await expect(page.getByRole('heading', { name: 'Ενημέρωση Προσφοράς' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Εκκρεμής', { exact: true })).toBeVisible()

    const update = page.getByRole('button', { name: 'Ενημέρωση Προσφοράς' })
    await expect(update).toBeDisabled()

    const firstOpenCell = page.locator('td button[aria-pressed="true"]').first()
    await firstOpenCell.click()
    await expect(update).toBeEnabled()

    const sent = page.waitForResponse((r) => r.url().includes('/api/offers') && r.request().method() === 'PUT')
    await update.click()
    const body = await (await sent).json()
    expect(body.success).toBe(true)

    const slots = body.offer.availabilitySlots as Record<string, string[]>
    const total = Object.values(slots).reduce((n, hours) => n + hours.length, 0)
    const stored = await getOffer(body.offer.id)
    const storedTotal = Object.values(stored?.availabilitySlots as Record<string, string[]>)
      .reduce((n, hours) => n + hours.length, 0)
    expect(storedTotal).toBe(total)
    expect(Object.keys(slots)).toHaveLength(2)
  })
})
