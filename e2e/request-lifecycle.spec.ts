import { test, expect, type APIRequestContext } from '@playwright/test'
import { TEST_GARAGE, loginAsClient } from './helpers'
import {
  acceptOffer,
  adminAssign,
  adminCancel,
  adminCookie,
  athensDatePlus,
  bookedAppointment,
  cancelAppointment,
  createOffer,
  createRequest,
  deactivateGarage,
  garageToken,
  newClient,
  PASSWORD,
  requestWithOffer,
  type TestClient,
} from './d-helpers'
import {
  ageAppointment,
  deleteOffer,
  getOffer,
  getServiceRequest,
  insertCompetingOffer,
  makeLegacyCompletion,
  makeUnpricedCompletion,
  putOffer,
  unfreezeCommissionRate,
} from './dynamo-helpers'
import { newGarage, summary } from './E-helpers'
import { athensToday } from '../src/utils/athensTime'

/**
 * The transitions a request goes through after its offers arrive — accept,
 * cancel, complete, admin cancel — and the commission computed at the end.
 *
 * Each of these used to trust the caller about state or amounts: an accept
 * could reopen a cancelled or completed job, a cancel could erase one that
 * had already happened, and a garage could pick its own VAT rate. Every test
 * here is a case that succeeded before.
 */

let shared: TestClient | null = null

/** One client for the whole file: requests are cheap, registrations are rate-limited. */
async function client(request: APIRequestContext): Promise<TestClient> {
  if (!shared) shared = await newClient(request, 'lifecycle')
  return shared
}

function complete(request: APIRequestContext, garage: string, requestId: string, data: Record<string, unknown>) {
  return request.post(`/api/requests/${requestId}/complete/`, {
    headers: { Cookie: `auth-token=${garage}` },
    data,
  })
}

test.describe('Accepting an offer', () => {
  test('books the stored offer amount, never a price the client sends', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId, date } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: trusted price',
      offerAmount: 150,
    })

    // A price that is not the offer's is refused outright, not booked at either figure.
    const forged = await acceptOffer(request, c, requestId, {
      offerId,
      appointmentDate: date,
      appointmentTime: '10:00',
      appointmentPrice: 1,
    })
    expect(forged.status()).toBe(409)
    expect((await forged.json()).code).toBe('OFFER_AMOUNT_CHANGED')
    expect((await getServiceRequest(requestId))?.status).toBe('pending')

    const resp = await acceptOffer(request, c, requestId, {
      offerId,
      appointmentDate: date,
      appointmentTime: '10:00',
    })
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await resp.json()).request.appointmentPrice).toBe(150)

    expect((await getServiceRequest(requestId))?.appointmentPrice).toBe(150)
    const offer = await getOffer(offerId)
    expect(offer?.status).toBe('accepted')
    expect(offer?.appointmentPrice).toBe(150)
  })

  test('refuses a date before today and an hour that has already gone', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: past date',
    })

    const yesterday = await acceptOffer(request, c, requestId, {
      offerId,
      appointmentDate: athensDatePlus(-1),
      appointmentTime: '10:00',
    })
    expect(yesterday.status()).toBe(400)
    expect((await yesterday.json()).error).toContain('έχει περάσει')

    // 00:00 today has always passed by the time this runs.
    const earlierToday = await acceptOffer(request, c, requestId, {
      offerId,
      appointmentDate: athensToday(),
      appointmentTime: '00:00',
    })
    expect(earlierToday.status()).toBe(400)
    expect((await earlierToday.json()).error).toContain('έχει περάσει')

    expect((await getServiceRequest(requestId))?.status).toBe('pending')
  })

  test('is refused once the appointment has been cancelled', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId, date } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: accept after cancel',
    })

    const cancel = await cancelAppointment(request, c, requestId)
    expect(cancel.status(), await cancel.text()).toBe(200)

    // A stale tab still showing the offer as acceptable.
    const again = await acceptOffer(request, c, requestId, {
      offerId,
      appointmentDate: date,
      appointmentTime: '11:00',
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).error).toContain('ακυρωθεί')

    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('cancelled')
    expect((await getOffer(offerId))?.status).toBe('rejected')
  })

  test('two concurrent accepts of different offers: exactly one wins', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId, date } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: concurrent accepts',
      offerAmount: 150,
    })
    const competingId = await insertCompetingOffer(requestId, 140, [date])

    const [a, b] = await Promise.all([
      acceptOffer(request, c, requestId, { offerId, appointmentDate: date, appointmentTime: '10:00' }),
      acceptOffer(request, c, requestId, { offerId: competingId, appointmentDate: date, appointmentTime: '12:00' }),
    ])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])

    const winner = a.status() === 200 ? offerId : competingId
    const loser = winner === offerId ? competingId : offerId
    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('appointment')
    expect(stored?.acceptedOfferId).toBe(winner)
    expect(stored?.appointmentPrice).toBe(winner === offerId ? 150 : 140)
    expect((await getOffer(winner))?.status).toBe('accepted')
    expect((await getOffer(loser))?.status).toBe('rejected')
  })
})

test.describe('Accepting an offer the garage changed or can no longer honour', () => {
  test('a price raised after the client loaded it is 409, and nothing is booked until the client accepts the new one', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId, date, garage } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: re-priced',
      offerAmount: 100,
    })
    const edit = await request.put('/api/offers/', {
      headers: { Cookie: `auth-token=${garage}` },
      data: { offerId, offerAmount: 500 },
    })
    expect(edit.status(), await edit.text()).toBe(200)

    // The client's tab still shows 100 €.
    const stale = await acceptOffer(request, c, requestId, {
      offerId, appointmentDate: date, appointmentTime: '10:00', expectedAmount: 100,
    })
    expect(stale.status()).toBe(409)
    const body = await stale.json()
    expect(body.code).toBe('OFFER_AMOUNT_CHANGED')
    expect(body.offerAmount).toBe(500)
    expect(body.error).toContain('Η προσφορά άλλαξε')
    expect((await getServiceRequest(requestId))?.status).toBe('pending')
    expect((await getOffer(offerId))?.status).toBe('pending')

    const seen = await acceptOffer(request, c, requestId, {
      offerId, appointmentDate: date, appointmentTime: '10:00', expectedAmount: 500,
    })
    expect(seen.status(), await seen.text()).toBe(200)
    expect((await getServiceRequest(requestId))?.appointmentPrice).toBe(500)
  })

  test('in the browser, the client is told the price changed and sees the new one', async ({ page, request }) => {
    const c = await client(request)
    const { requestId, offerId, date, garage } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: re-priced in the browser',
      offerAmount: 100,
    })

    await loginAsClient(page, request, c.email, PASSWORD)
    await page.goto(`/requests/${c.clientId}/details/${requestId}/`)
    // The card's price on its own — the error banner below quotes figures too.
    const price = (euros: number) => page.getByText(new RegExp(`^${euros}\\s€$`))
    await expect(price(100)).toBeVisible({ timeout: 60_000 })

    // The garage re-prices while the page is open.
    const edit = await request.put('/api/offers/', {
      headers: { Cookie: `auth-token=${garage}` },
      data: { offerId, offerAmount: 500 },
    })
    expect(edit.status()).toBe(200)

    const [y, m, d] = date.split('-')
    await page.getByRole('button', { name: new RegExp(`${d}/${m}/${y}`) }).click()
    const accept = page.waitForResponse((r) => r.url().includes('/accept-offer/'))
    await page.getByRole('button', { name: 'Αποδοχή προσφοράς' }).click()
    expect((await accept).status()).toBe(409)

    await expect(page.getByText(/Η προσφορά άλλαξε/)).toBeVisible({ timeout: 15_000 })
    // Reloaded in place: the card now carries the garage's new figure.
    await expect(price(500)).toBeVisible({ timeout: 30_000 })
    await expect(price(100)).toHaveCount(0)
    expect((await getServiceRequest(requestId))?.status).toBe('pending')
  })

  test('an offer from a garage deactivated since it was made cannot be accepted', async ({ request }) => {
    const c = await client(request)
    const admin = await adminCookie(request)
    const shop = await newGarage(request, { prefix: 'lifecycle-deactivated' })
    const date = athensDatePlus(30)
    const requestId = await createRequest(request, c, 'E2E lifecycle: deactivated garage')
    const offerId = await createOffer(request, shop.token, requestId, 150, [date])

    await deactivateGarage(request, admin, shop.id)

    const resp = await acceptOffer(request, c, requestId, {
      offerId, appointmentDate: date, appointmentTime: '10:00',
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('GARAGE_UNAVAILABLE')
    expect((await getServiceRequest(requestId))?.status).toBe('pending')
    expect((await getOffer(offerId))?.status).toBe('pending')
  })

  test('a new offer reaches the client\'s alerts at once, not when the cache expires', async ({ request }) => {
    // Its own client: the summary must start from a known state.
    const c = await newClient(request, 'lifecycle-alerts')
    const requestId = await createRequest(request, c, 'E2E lifecycle: offer alert')
    const before = await summary(request, c.token)
    expect(before.alerts.some((a) => a.kind === 'new-offers')).toBe(false)

    await createOffer(request, await garageToken(request), requestId, 150, [athensDatePlus(30)])

    const after = await summary(request, c.token)
    expect(after.alerts.some((a) => a.kind === 'new-offers')).toBe(true)
  })
})

test.describe('Cancelling an appointment', () => {
  test('is refused once the appointment has started', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: cancel after start',
    })
    await ageAppointment(requestId, 1)

    const resp = await cancelAppointment(request, c, requestId)
    expect(resp.status()).toBe(409)
    expect((await resp.json()).error).toContain('ξεκινήσει')

    // Still the garage's to close, with its offer intact.
    expect((await getServiceRequest(requestId))?.status).toBe('appointment')
    expect((await getOffer(offerId))?.status).toBe('accepted')
  })

  test('two concurrent cancels: exactly one succeeds', async ({ request }) => {
    const c = await client(request)
    const { requestId } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: concurrent cancels',
    })

    const [a, b] = await Promise.all([
      cancelAppointment(request, c, requestId),
      cancelAppointment(request, c, requestId),
    ])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])
    expect((await getServiceRequest(requestId))?.status).toBe('cancelled')
  })

  test('the request and its offer change together or not at all', async ({ request }) => {
    const c = await client(request)
    const admin = await adminCookie(request)
    const { requestId, offerId } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: atomic cancel',
    })
    // Stand-in for an offer write that fails: with the row gone, the offer
    // half of the cancel cannot apply — so the request half must not either.
    const offer = await getOffer(offerId)
    await deleteOffer(offerId)

    const byClient = await cancelAppointment(request, c, requestId)
    expect(byClient.status()).toBe(409)
    expect((await getServiceRequest(requestId))?.status).toBe('appointment')
    // And no stray offer row was written in its place.
    expect(await getOffer(offerId)).toBeUndefined()

    const byAdmin = await adminCancel(request, admin, requestId)
    expect(byAdmin.status()).toBe(409)
    expect((await getServiceRequest(requestId))?.status).toBe('appointment')
    expect(await getOffer(offerId)).toBeUndefined()

    // Nothing was half-applied, so once the cause is gone a retry simply works.
    await putOffer(offer!)
    const retry = await cancelAppointment(request, c, requestId)
    expect(retry.status(), await retry.text()).toBe(200)
    expect((await getServiceRequest(requestId))?.status).toBe('cancelled')
    expect((await getOffer(offerId))?.status).toBe('rejected')
  })
})

test.describe('Completing a job', () => {
  test('refuses a VAT rate the completion form does not offer', async ({ request }) => {
    const c = await client(request)
    const { requestId, garage } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: VAT rate',
    })
    await ageAppointment(requestId, 2)

    // 100% would halve the net, and with it the commission.
    const forged = await complete(request, garage, requestId, {
      outcome: 'completed', amount: 248, vatIncluded: true, vatRate: 100,
    })
    expect(forged.status()).toBe(400)
    expect((await getServiceRequest(requestId))?.status).toBe('appointment')

    const zero = await complete(request, garage, requestId, { outcome: 'completed', amount: 0 })
    expect(zero.status()).toBe(400)

    const honest = await complete(request, garage, requestId, {
      outcome: 'completed', amount: 248, vatIncluded: true, vatRate: 24,
    })
    expect(honest.status(), await honest.text()).toBe(200)
    expect((await honest.json()).amounts.net).toBe(200)
  })
})

test.describe('A deactivated garage and the jobs it already holds', () => {
  test('it can still close its booked job and rate the client', async ({ request }) => {
    const c = await client(request)
    const admin = await adminCookie(request)
    const shop = await newGarage(request, { prefix: 'lifecycle-closes' })
    const date = athensDatePlus(30)
    const requestId = await createRequest(request, c, 'E2E lifecycle: deactivated, booked')
    const offerId = await createOffer(request, shop.token, requestId, 124, [date])
    const accept = await acceptOffer(request, c, requestId, {
      offerId, appointmentDate: date, appointmentTime: '10:00',
    })
    expect(accept.status(), await accept.text()).toBe(200)

    await deactivateGarage(request, admin, shop.id)
    await ageAppointment(requestId, 2)

    const done = await complete(request, shop.token, requestId, {
      outcome: 'completed', amount: 124, vatIncluded: true, rating: 5,
    })
    expect(done.status(), await done.text()).toBe(200)
    const body = await done.json()
    expect(body.reviewError).toBeUndefined()
    expect(body.amounts.net).toBe(100)

    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('completed')
    expect(stored?.completionOutcome).toBe('completed')

    // Its own review of the job is still its to read.
    const review = await request.get(`/api/requests/${requestId}/review/`, {
      headers: { Cookie: `auth-token=${shop.token}` },
    })
    expect(review.status(), await review.text()).toBe(200)
    expect((await review.json()).mine?.rating).toBe(5)

    // Still nobody else's job to close.
    const stranger = await complete(request, await garageToken(request), requestId, { outcome: 'no_show' })
    expect(stranger.status()).toBe(403)
  })
})

test.describe('Commissions', () => {
  test('a no-show is not billed, a declared job is billed on its net, a legacy one on the quote net', async ({ request }) => {
    // Three full bookings in one test; a dev server that is recompiling can
    // take most of the default budget on its own.
    test.slow()
    const c = await client(request)
    const admin = await adminCookie(request)

    const noShow = await bookedAppointment(request, c, { description: 'E2E lifecycle: no-show', offerAmount: 310 })
    const done = await bookedAppointment(request, c, { description: 'E2E lifecycle: billed', offerAmount: 150 })
    const legacy = await bookedAppointment(request, c, { description: 'E2E lifecycle: legacy', offerAmount: 124 })
    const date = await ageAppointment(noShow.requestId, 2)
    await ageAppointment(done.requestId, 2)
    await ageAppointment(legacy.requestId, 2)
    const month = date.slice(0, 7)

    const stats = async () => {
      const resp = await request.get(`/api/admin/commissions/stats/?month=${month}`, {
        headers: { Cookie: admin },
      })
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      return body.byGarage.find((g: { garageId: string }) => g.garageId === TEST_GARAGE.id) ?? {
        appointmentCount: 0,
        commission: 0,
      }
    }
    const before = await stats()

    const noShowResp = await complete(request, noShow.garage, noShow.requestId, { outcome: 'no_show' })
    expect(noShowResp.status(), await noShowResp.text()).toBe(200)
    expect((await getServiceRequest(noShow.requestId))?.completionOutcome).toBe('no_show')

    // Closed with no outcome, nothing declared: what jobs closed before the
    // completion flow look like.
    const legacyResp = await complete(request, legacy.garage, legacy.requestId, { outcome: 'completed', amount: 124 })
    expect(legacyResp.status()).toBe(200)
    await makeLegacyCompletion(legacy.requestId)

    // The no-show and the legacy job only: the overview moves by exactly the
    // legacy job.
    const afterNoShow = await stats()
    expect(afterNoShow.appointmentCount).toBe(before.appointmentCount + 1)

    const doneResp = await complete(request, done.garage, done.requestId, {
      outcome: 'completed', amount: 186, vatIncluded: true,
    })
    expect(doneResp.status()).toBe(200)

    const detail = await request.get(`/api/admin/commissions/garage/${TEST_GARAGE.id}/?month=${month}`, {
      headers: { Cookie: admin },
    })
    expect(detail.status()).toBe(200)
    const rows = (await detail.json()).appointments as {
      requestId: string; basis: string; basisAmount: number; appointmentPrice: number
    }[]

    expect(rows.find((r) => r.requestId === noShow.requestId)).toBeUndefined()

    const billed = rows.find((r) => r.requestId === done.requestId)
    expect(billed?.basis).toBe('declared')
    expect(billed?.basisAmount).toBe(150) // 186 gross at 24%

    // The quote is VAT-inclusive, so the fallback bills its net: 124 → 100.
    const fallback = rows.find((r) => r.requestId === legacy.requestId)
    expect(fallback?.basis).toBe('quoted')
    expect(fallback?.appointmentPrice).toBe(124)
    expect(fallback?.basisAmount).toBe(100)
  })
})

test.describe('Commission totals', () => {
  test('the overview and the garage detail page report the same figures', async ({ request }) => {
    test.slow()
    const c = await client(request)
    const admin = await adminCookie(request)
    // Its own garage, so its line on the overview holds only these jobs.
    const shop = await newGarage(request, { prefix: 'lifecycle-commission' })

    const book = async (description: string) => {
      const date = athensDatePlus(30)
      const requestId = await createRequest(request, c, description)
      const offerId = await createOffer(request, shop.token, requestId, 50, [date])
      const accept = await acceptOffer(request, c, requestId, { offerId, appointmentDate: date, appointmentTime: '10:00' })
      expect(accept.status(), await accept.text()).toBe(200)
      return requestId
    }

    // Three jobs whose commission has a fraction of a cent: summed per job and
    // summed overall round differently, which is how the two pages drifted.
    const jobs = [
      await book('E2E commission totals 1'),
      await book('E2E commission totals 2'),
      await book('E2E commission totals 3'),
    ]
    const unpriced = await book('E2E commission totals: unpriced')
    let month = ''
    for (const requestId of [...jobs, unpriced]) {
      month = (await ageAppointment(requestId, 2)).slice(0, 7)
      const done = await complete(request, shop.token, requestId, {
        outcome: 'completed', amount: 10.03, vatIncluded: false,
      })
      expect(done.status(), await done.text()).toBe(200)
    }
    // Billed nothing — the overview used to drop it while the detail counted it.
    await makeUnpricedCompletion(unpriced)

    const statsResp = await request.get(`/api/admin/commissions/stats/?month=${month}`, { headers: { Cookie: admin } })
    expect(statsResp.status()).toBe(200)
    const stats = await statsResp.json()
    const line = stats.byGarage.find((g: { garageId: string }) => g.garageId === shop.id)

    const detailResp = await request.get(`/api/admin/commissions/garage/${shop.id}/?month=${month}`, {
      headers: { Cookie: admin },
    })
    expect(detailResp.status()).toBe(200)
    const detail = await detailResp.json()

    const percent: number = detail.commissionPercent
    const round = (n: number) => Math.round(n * 100) / 100
    const perJob = round(10.03 * (percent / 100))

    expect(detail.appointments.map((a: { requestId: string }) => a.requestId).sort()).toEqual([...jobs].sort())
    expect(detail.totals.appointmentCount).toBe(3)
    expect(detail.totals.totalRevenue).toBe(30.09)
    expect(detail.totals.commission).toBe(round(3 * perJob))

    expect(line).toBeTruthy()
    expect(line.appointmentCount).toBe(detail.totals.appointmentCount)
    expect(line.totalRevenue).toBe(detail.totals.totalRevenue)
    expect(line.commission).toBe(detail.totals.commission)
  })
})

test.describe('Commission rates', () => {
  test('each garage is billed at its agreed rate or the 15% default, and a rate change never re-prices a closed job', async ({ request }) => {
    test.slow()
    const c = await client(request)
    const admin = await adminCookie(request)
    const custom = await newGarage(request, { prefix: 'rate-custom' })
    const plain = await newGarage(request, { prefix: 'rate-default' })

    const setRate = (garageId: string, commissionPercent: unknown, cookie = admin) =>
      request.put(`/api/admin/commissions/garage/${garageId}/rate/`, {
        headers: { Cookie: cookie },
        data: { commissionPercent },
      })
    const book = async (garageToken: string, description: string) => {
      const date = athensDatePlus(30)
      const requestId = await createRequest(request, c, description)
      const offerId = await createOffer(request, garageToken, requestId, 124, [date])
      const accept = await acceptOffer(request, c, requestId, { offerId, appointmentDate: date, appointmentTime: '10:00' })
      expect(accept.status(), await accept.text()).toBe(200)
      return requestId
    }
    /** Closes a job two days back (or `daysAgo`) declaring a net of 100. Returns its month. */
    const close = async (garageToken: string, requestId: string, daysAgo = 2) => {
      const month = (await ageAppointment(requestId, daysAgo)).slice(0, 7)
      const done = await complete(request, garageToken, requestId, { outcome: 'completed', amount: 100, vatIncluded: false })
      expect(done.status(), await done.text()).toBe(200)
      return month
    }
    const stats = async (month: string) => {
      const resp = await request.get(`/api/admin/commissions/stats/?month=${month}`, { headers: { Cookie: admin } })
      expect(resp.status()).toBe(200)
      return resp.json()
    }
    const detail = async (garageId: string, month: string) => {
      const resp = await request.get(`/api/admin/commissions/garage/${garageId}/?month=${month}`, { headers: { Cookie: admin } })
      expect(resp.status()).toBe(200)
      return resp.json()
    }

    // Only an admin sets a rate, and only a real one.
    expect((await setRate(custom.id, 10, `auth-token=${custom.token}`)).status()).toBe(401)
    for (const bad of [-1, 101, '10', 'δέκα', true]) {
      expect((await setRate(custom.id, bad)).status(), JSON.stringify(bad)).toBe(400)
    }
    expect((await setRate('garage-does-not-exist', 10)).status()).toBe(404)
    const agreed = await setRate(custom.id, 10)
    expect(agreed.status(), await agreed.text()).toBe(200)
    expect(await agreed.json()).toMatchObject({ commissionPercent: 10, hasCustomRate: true })

    // At 10%: one job. At the default: one job.
    const atTen = await book(custom.token, 'E2E rate: custom at 10%')
    const month = await close(custom.token, atTen)
    const atDefault = await book(plain.token, 'E2E rate: default')
    expect(await close(plain.token, atDefault)).toBe(month)
    expect((await getServiceRequest(atTen))?.commissionPercent).toBe(10)
    expect((await getServiceRequest(atDefault))?.commissionPercent).toBe(15)

    // The rate goes up mid-month. The job already closed keeps its 10%.
    expect((await setRate(custom.id, 20)).status()).toBe(200)
    const atTwenty = await book(custom.token, 'E2E rate: custom at 20%')
    expect(await close(custom.token, atTwenty)).toBe(month)

    // A job closed before rates were frozen is billed at the garage's rate today.
    const legacy = await book(custom.token, 'E2E rate: legacy, no frozen rate')
    expect(await close(custom.token, legacy)).toBe(month)
    await unfreezeCommissionRate(legacy)

    // A job in another month stays out of this one.
    const earlier = await book(custom.token, 'E2E rate: an earlier month')
    const earlierMonth = await close(custom.token, earlier, 40)
    expect(earlierMonth).not.toBe(month)

    const overview = await stats(month)
    const customLine = overview.byGarage.find((g: { garageId: string }) => g.garageId === custom.id)
    const plainLine = overview.byGarage.find((g: { garageId: string }) => g.garageId === plain.id)
    expect(overview.defaultCommissionPercent).toBe(15)
    // 100 × 10% + 100 × 20% + 100 × 20% (legacy, today's rate)
    expect(customLine).toMatchObject({
      appointmentCount: 3, totalRevenue: 300, commission: 50,
      commissionPercent: 20, hasCustomRate: true, effectivePercent: 16.67,
    })
    expect(plainLine).toMatchObject({
      appointmentCount: 1, totalRevenue: 100, commission: 15,
      commissionPercent: 15, hasCustomRate: false, effectivePercent: 15,
    })

    // The detail page lists the same jobs at the same rates and sums to the overview's line.
    const page = await detail(custom.id, month)
    const byId = Object.fromEntries(page.appointments.map((a: { requestId: string }) => [a.requestId, a]))
    expect(byId[atTen]).toMatchObject({ commissionPercent: 10, rateSource: 'job', commission: 10 })
    expect(byId[atTwenty]).toMatchObject({ commissionPercent: 20, rateSource: 'job', commission: 20 })
    expect(byId[legacy]).toMatchObject({ commissionPercent: 20, rateSource: 'garage', commission: 20 })
    expect(byId[earlier]).toBeUndefined()
    expect(page.totals).toMatchObject({ appointmentCount: 3, totalRevenue: 300, commission: 50 })
    expect(page).toMatchObject({ commissionPercent: 20, hasCustomRate: true, defaultCommissionPercent: 15 })

    const before = await detail(custom.id, earlierMonth)
    expect(before.appointments.map((a: { requestId: string }) => a.requestId)).toEqual([earlier])
    expect(before.totals.commission).toBe(20)

    // Back to the default: the rows already billed do not move.
    const reset = await setRate(custom.id, null)
    expect(await reset.json()).toMatchObject({ commissionPercent: 15, hasCustomRate: false })
    const afterReset = await detail(custom.id, month)
    expect(afterReset.totals.commission).toBe(10 + 20 + 15) // the legacy job follows today's rate
    expect(afterReset.hasCustomRate).toBe(false)
  })
})

test.describe('Admin assign', () => {
  test('files an ordinary offer: one per garage, only on an open request, with hours', async ({ request }) => {
    const c = await client(request)
    const admin = await adminCookie(request)
    const date = athensDatePlus(30)
    const shop = await newGarage(request, { prefix: 'lifecycle-assign' })
    const requestId = await createRequest(request, c, 'E2E lifecycle: admin assign')
    const own = await createOffer(request, shop.token, requestId, 150, [date])

    // The garage already quoted: an admin offer on top would be a second one.
    const twice = await adminAssign(request, admin, requestId, { garageId: shop.id, price: 99, availabilityDates: [date] })
    expect(twice.status()).toBe(409)
    expect((await twice.json()).code).toBe('OFFER_EXISTS')

    const listed = await request.get(`/api/offers/?serviceRequestId=${requestId}`, {
      headers: { Cookie: `auth-token=${c.token}` },
    })
    const byShop = ((await listed.json()).offers as { id: string; garageId: string; offerAmount: number }[])
      .filter((o) => o.garageId === shop.id)
    expect(byShop).toHaveLength(1)
    expect(byShop[0].id).toBe(own)
    expect(byShop[0].offerAmount).toBe(150)

    const past = await adminAssign(request, admin, requestId, {
      garageId: TEST_GARAGE.id, price: 120, availabilityDates: [athensDatePlus(-3)],
    })
    expect(past.status()).toBe(400)

    // Another garage gets an ordinary offer the client can book by the hour.
    const assigned = await adminAssign(request, admin, requestId, {
      garageId: TEST_GARAGE.id, price: 120, availabilityDates: [date],
    })
    expect(assigned.status(), await assigned.text()).toBe(200)
    const assignedId: string = (await assigned.json()).offerId
    const stored = await getOffer(assignedId)
    expect(stored?.status).toBe('pending')
    expect(stored?.offerAmount).toBe(120)
    expect((stored?.availabilitySlots as Record<string, string[]>)[date]?.length).toBeGreaterThan(0)

    const again = await adminAssign(request, admin, requestId, {
      garageId: TEST_GARAGE.id, price: 130, availabilityDates: [date],
    })
    expect(again.status()).toBe(409)
    expect((await getOffer(assignedId))?.offerAmount).toBe(120)

    const cancel = await adminCancel(request, admin, requestId)
    expect(cancel.status(), await cancel.text()).toBe(200)
    const late = await adminAssign(request, admin, requestId, {
      garageId: TEST_GARAGE.id, price: 120, availabilityDates: [date],
    })
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe('REQUEST_NOT_OPEN')
  })
})

test.describe('Admin cancel', () => {
  test('refuses a completed job', async ({ request }) => {
    const c = await client(request)
    const { requestId, garage } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: admin cancel completed',
    })
    await ageAppointment(requestId, 2)
    const done = await complete(request, garage, requestId, { outcome: 'completed', amount: 150 })
    expect(done.status()).toBe(200)

    const resp = await request.patch(`/api/admin/requests/${requestId}/cancel/`, {
      headers: { Cookie: await adminCookie(request) },
    })
    expect(resp.status(), await resp.text()).toBe(409)

    const stored = await getServiceRequest(requestId)
    expect(stored?.status).toBe('completed')
    expect(stored?.finalAmounts).toBeTruthy()
  })

  test('cancelling an appointment also closes its accepted offer', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId } = await bookedAppointment(request, c, {
      description: 'E2E lifecycle: admin cancel appointment',
    })

    const resp = await request.patch(`/api/admin/requests/${requestId}/cancel/`, {
      headers: { Cookie: await adminCookie(request) },
    })
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await getServiceRequest(requestId))?.status).toBe('cancelled')
    expect((await getOffer(offerId))?.status).toBe('rejected')
  })

  test('cancelling a request still collecting quotes closes every quote on it', async ({ request }) => {
    const c = await client(request)
    const { requestId, offerId, date } = await requestWithOffer(request, c, {
      description: 'E2E lifecycle: admin cancel pending',
    })
    const competingId = await insertCompetingOffer(requestId, 140, [date])

    const resp = await adminCancel(request, await adminCookie(request), requestId)
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await getServiceRequest(requestId))?.status).toBe('cancelled')
    expect((await getOffer(offerId))?.status).toBe('rejected')
    expect((await getOffer(competingId))?.status).toBe('rejected')
  })
})
