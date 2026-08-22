import { test, expect, type APIRequestContext } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { ageAppointment, getGarage, getServiceRequest } from './dynamo-helpers'

/**
 * Appointment → completion → two-way review.
 *
 * Nothing in the app moved a request to COMPLETED before this flow existed:
 * the status was in the enum and the admin commission report queried for it,
 * so that report was permanently empty. These tests cover the transition, the
 * declared amount the commission is actually based on, and the double-blind
 * reveal between the two reviews.
 */

const PASSWORD = 'TestPass123'
const FUTURE_DATES = ['2027-04-15', '2027-04-16']

let clientId = ''
let clientToken = ''
let garageToken = ''
let requestId = ''
let offerId = ''

async function freshGarageToken(request: APIRequestContext) {
  return (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
}

test.describe.serial('Completion and reviews', () => {
  test('Setup: request, offer, accepted appointment', async ({ request }) => {
    const email = `e2e-done-${Date.now()}@test.com`
    const reg = await registerClient(request, email, PASSWORD)
    clientId = reg.client.id
    clientToken = (await loginViaAPI(request, email, PASSWORD, 'client')).token
    garageToken = await freshGarageToken(request)

    const sr = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E completion flow',
        brand: 'Ford',
        model: 'Focus',
        modelYear: '2016',
        engineCC: '1600',
        fuelType: 'diesel',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(sr.status()).toBe(200)
    requestId = (await sr.json()).serviceRequestId

    const offer = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: {
        serviceRequestId: requestId,
        offerAmount: 200,
        benefits: ['Δωρεάν έλεγχος'],
        availableDates: FUTURE_DATES,
      },
    })
    expect(offer.status()).toBe(200)
    offerId = (await offer.json()).offer.id

    const accept = await request.patch(`/api/requests/${requestId}/accept-offer/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        offerId,
        appointmentDate: FUTURE_DATES[0],
        appointmentTime: '10:00',
        appointmentPrice: 200,
      },
    })
    expect(accept.status()).toBe(200)

    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('appointment')
    expect(stored?.acceptedGarageId).toBe(TEST_GARAGE.id)
  })

  test('A future appointment cannot be closed yet', async ({ request }) => {
    const resp = await request.post(`/api/requests/${requestId}/complete/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { outcome: 'completed', amount: 200 },
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).error).toContain('δεν έχει ολοκληρωθεί')
  })

  test('A garage that did not get the job cannot close it', async ({ request }) => {
    await ageAppointment(requestId, 2)
    const resp = await request.post(`/api/requests/${requestId}/complete/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { outcome: 'completed', amount: 200 },
    })
    // A client is not a garage at all.
    expect(resp.status()).toBe(403)
  })

  test('Completing requires a declared amount', async ({ request }) => {
    const resp = await request.post(`/api/requests/${requestId}/complete/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { outcome: 'completed' },
    })
    expect(resp.status()).toBe(400)
    expect((await resp.json()).error).toContain('ποσό')
  })

  test('The garage closes the job, declares a gross amount and rates the client', async ({ request }) => {
    const before = await getGarage(TEST_GARAGE.id)
    const beforeCount = Number(before?.ratingCount ?? 0)

    const resp = await request.post(`/api/requests/${requestId}/complete/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: {
        outcome: 'completed',
        amount: 248,
        vatIncluded: true,
        notes: 'Αλλαγή λαδιών και φίλτρων.',
        rating: 5,
        comment: 'Συνεπής πελάτης.',
        tags: ['Ήρθε στην ώρα του'],
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    // 248 gross at 24% → 200 net, 48 VAT.
    expect(data.amounts.gross).toBe(248)
    expect(data.amounts.net).toBe(200)
    expect(data.amounts.vat).toBe(48)
    expect(data.amounts.vatRate).toBe(24)
    expect(data.reviewError).toBeUndefined()

    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('completed')
    expect(stored?.completedBy).toBe('garage')
    expect((stored?.finalAmounts as { net: number }).net).toBe(200)

    // The garage rated the CLIENT, so the garage's own aggregate must not move.
    const after = await getGarage(TEST_GARAGE.id)
    expect(Number(after?.ratingCount ?? 0)).toBe(beforeCount)
  })

  test('Closing the same job twice is refused', async ({ request }) => {
    const resp = await request.post(`/api/requests/${requestId}/complete/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { outcome: 'completed', amount: 100 },
    })
    expect(resp.status()).toBe(409)
  })

  test("The client cannot read the garage's review before writing their own", async ({ request }) => {
    const resp = await request.get(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.canReview).toBe(true)
    expect(data.mine).toBeNull()
    // They can see that something was written, but not what.
    expect(data.theirsExists).toBe(true)
    expect(data.theirs).toBeNull()
  })

  test('The client rates the garage, which reveals both reviews', async ({ request }) => {
    const before = await getGarage(TEST_GARAGE.id)
    const beforeCount = Number(before?.ratingCount ?? 0)
    const beforeSum = Number(before?.ratingSum ?? 0)

    const resp = await request.post(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { rating: 4, comment: 'Καλή δουλειά, στην ώρα του.', tags: ['Καθαρή δουλειά', 'ΑΚΥΡΟ TAG'] },
    })
    expect(resp.status()).toBe(200)
    const created = await resp.json()
    // Tags outside the offered set are dropped rather than stored.
    expect(created.review.tags).toEqual(['Καθαρή δουλειά'])

    const after = await getGarage(TEST_GARAGE.id)
    expect(Number(after?.ratingCount ?? 0)).toBe(beforeCount + 1)
    expect(Number(after?.ratingSum ?? 0)).toBe(beforeSum + 4)

    const view = await request.get(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    const data = await view.json()
    expect(data.mine.rating).toBe(4)
    // Both have now written, so the garage's review is revealed.
    expect(data.theirs.rating).toBe(5)
    expect(data.theirs.comment).toContain('Συνεπής')
    expect(data.canReview).toBe(false)
  })

  test('A second review from the same side is refused', async ({ request }) => {
    const resp = await request.post(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { rating: 1, comment: 'Άλλαξα γνώμη.' },
    })
    expect(resp.status()).toBe(409)
  })

  test('An unrelated client cannot read or write this job\'s reviews', async ({ request }) => {
    const email = `e2e-nosy-${Date.now()}@test.com`
    await registerClient(request, email, PASSWORD)
    const nosyToken = (await loginViaAPI(request, email, PASSWORD, 'client')).token

    const read = await request.get(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${nosyToken}` },
    })
    expect(read.status()).toBe(403)

    const write = await request.post(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${nosyToken}` },
      data: { rating: 1 },
    })
    expect(write.status()).toBe(403)
  })

  test('An out-of-range rating is refused', async ({ request }) => {
    const email = `e2e-range-${Date.now()}@test.com`
    const reg = await registerClient(request, email, PASSWORD)
    const token = (await loginViaAPI(request, email, PASSWORD, 'client')).token

    const sr = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        clientId: reg.client.id, category: 'allagi-ladion', description: 'range check',
        brand: 'Kia', model: 'Rio', modelYear: '2015', engineCC: '1200',
        fuelType: 'petrol', isAutomatic: false, is4x4: false,
      },
    })
    const rid = (await sr.json()).serviceRequestId

    const gt = await freshGarageToken(request)
    const offer = await request.post('/api/offers', {
      headers: { Cookie: `auth-token=${gt}` },
      data: { serviceRequestId: rid, offerAmount: 90, benefits: [], availableDates: FUTURE_DATES },
    })
    const oid = (await offer.json()).offer.id
    await request.patch(`/api/requests/${rid}/accept-offer/`, {
      headers: { Cookie: `auth-token=${token}` },
      data: { offerId: oid, appointmentDate: FUTURE_DATES[0], appointmentTime: '10:00', appointmentPrice: 90 },
    })
    await ageAppointment(rid, 1)
    await request.post(`/api/requests/${rid}/complete/`, {
      headers: { Cookie: `auth-token=${gt}` },
      data: { outcome: 'completed', amount: 90 },
    })

    const resp = await request.post(`/api/requests/${rid}/review/`, {
      headers: { Cookie: `auth-token=${token}` },
      data: { rating: 9 },
    })
    expect(resp.status()).toBe(400)
  })
})
