import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  acceptOffer,
  cookie,
  makeOffer,
  newClient,
  newGarage,
  OFFER_DATES,
  signInGarage,
  summary,
  summaryUntil,
  type TestClient,
  type TestGarage,
} from './E-helpers'
import { loginAsClient } from './helpers'
import { PASSWORD } from './E-helpers'

/**
 * What a client compares offers by, and what a garage learns back: the note on
 * an offer, that the client looked at it, that the client went with another
 * garage (and nothing more), the amount it quoted last time for the same car,
 * and which requests reach it at all by the kind of shop it is.
 *
 * Every test builds its own garages: TEST_GARAGE's books are never in a known state.
 */

async function requestFor(
  request: APIRequestContext,
  client: TestClient,
  category: string,
  vehicle: { brand: string; model: string } = { brand: 'Skoda', model: 'Octavia' }
): Promise<string> {
  const bodywork = category === 'oliki-vafi' || category === 'meriki-vafi'
  const resp = await request.post('/api/service-request', {
    headers: cookie(client.token),
    data: {
      clientId: client.clientId,
      category,
      description: 'E2E offers UX',
      brand: vehicle.brand,
      model: vehicle.model,
      modelYear: '2019',
      ...(bodywork ? {} : { engineCC: '1400', fuelType: 'petrol' }),
      isAutomatic: false,
      is4x4: false,
    },
  })
  expect(resp.status(), await resp.text()).toBe(200)
  return (await resp.json()).serviceRequestId
}

async function offer(
  request: APIRequestContext,
  garage: TestGarage,
  requestId: string,
  data: Record<string, unknown> = {}
) {
  return request.post('/api/offers', {
    headers: cookie(garage.token),
    data: { serviceRequestId: requestId, offerAmount: 150, benefits: [], availabilityDates: OFFER_DATES, ...data },
  })
}

async function clientOffers(request: APIRequestContext, client: TestClient, requestId: string) {
  const resp = await request.get(`/api/offers/?serviceRequestId=${requestId}`, { headers: cookie(client.token) })
  expect(resp.status()).toBe(200)
  return (await resp.json()).offers as Record<string, unknown>[]
}

test.describe('The note on an offer', () => {
  test('reaches the client, can be edited, and is capped at 500 characters', async ({ request }) => {
    const client = await newClient(request, 'notes')
    const garage = await newGarage(request, { prefix: 'notes' })
    const requestId = await requestFor(request, client, 'symplektis')

    const tooLong = await offer(request, garage, requestId, { notes: 'α'.repeat(501) })
    expect(tooLong.status()).toBe(400)

    const created = await offer(request, garage, requestId, { notes: '  Γνήσιο κιτ συμπλέκτη, 4 ώρες.  ' })
    expect(created.status(), await created.text()).toBe(200)
    const offerId = (await created.json()).offer.id
    expect((await clientOffers(request, client, requestId))[0].notes).toBe('Γνήσιο κιτ συμπλέκτη, 4 ώρες.')

    // An edit that leaves the note out keeps it; one that sends it replaces it.
    const priceOnly = await request.put('/api/offers', {
      headers: cookie(garage.token),
      data: { offerId, offerAmount: 160 },
    })
    expect(priceOnly.status()).toBe(200)
    expect((await clientOffers(request, client, requestId))[0].notes).toBe('Γνήσιο κιτ συμπλέκτη, 4 ώρες.')

    const edited = await request.put('/api/offers', {
      headers: cookie(garage.token),
      data: { offerId, offerAmount: 160, notes: 'Με δίσκο Valeo.' },
    })
    expect(edited.status()).toBe(200)
    expect((await clientOffers(request, client, requestId))[0].notes).toBe('Με δίσκο Valeo.')
  })
})

test('The garage sees when the client opened its offer', async ({ request }) => {
  const client = await newClient(request, 'viewed')
  const garage = await newGarage(request, { prefix: 'viewed' })
  const requestId = await requestFor(request, client, 'symplektis')
  await makeOffer(request, garage, requestId)

  const mine = async () => {
    const resp = await request.get('/api/garage/offers/', { headers: cookie(garage.token) })
    expect(resp.status()).toBe(200)
    return ((await resp.json()).offers as Record<string, unknown>[]).find((o) => o.serviceRequestId === requestId)
  }
  expect((await mine())?.clientViewedAt).toBeNull()

  // What the client's request page posts when it opens.
  const seen = await request.post('/api/notifications/seen/', {
    headers: cookie(client.token),
    data: { kind: 'offers', id: requestId },
  })
  expect(seen.status()).toBe(200)
  const viewedAt = (await mine())?.clientViewedAt
  expect(typeof viewedAt).toBe('string')
  expect(Date.now() - Date.parse(viewedAt as string)).toBeLessThan(60_000)
})

test('A garage that lost is told the client chose another offer — not whose, not for how much', async ({ request }) => {
  const client = await newClient(request, 'lost')
  const winner = await newGarage(request, { prefix: 'lost-winner' })
  const loser = await newGarage(request, { prefix: 'lost-loser' })
  const requestId = await requestFor(request, client, 'symplektis')
  const winnerOffer = await makeOffer(request, winner, requestId)
  await makeOffer(request, loser, requestId)

  await acceptOffer(request, client, requestId, winnerOffer)

  const lost = await summaryUntil(request, loser.token, (s) => s.alerts.some((a) => a.kind === 'offer-lost'))
  const alert = lost.alerts.find((a) => a.kind === 'offer-lost')
  expect(alert, JSON.stringify(lost.alerts)).toBeTruthy()
  expect(alert!.title).toBe('Ο πελάτης επέλεξε άλλη προσφορά')
  expect(alert!.href).toBe(`/garage-dashboard/${loser.id}/offers/${requestId}/`)
  const words = JSON.stringify(alert)
  expect(words).not.toContain('150')
  expect(words).not.toContain('E2E Συνεργείο')

  // The winner is not told it lost.
  expect((await summary(request, winner.token)).alerts.some((a) => a.kind === 'offer-lost')).toBe(false)

  // Opening the link (AssignedElsewhere) marks it seen, and the alert goes.
  const seen = await request.post('/api/notifications/seen/', {
    headers: cookie(loser.token),
    data: { kind: 'lost', id: requestId },
  })
  expect(seen.status()).toBe(200)
  expect((await summary(request, loser.token)).alerts.some((a) => a.kind === 'offer-lost')).toBe(false)
})

test('The offer page tells the losing garage the client chose another offer, and clears the alert', async ({ page, request }) => {
  const client = await newClient(request, 'lost-ui')
  const winner = await newGarage(request, { prefix: 'lost-ui-winner' })
  const loser = await newGarage(request, { prefix: 'lost-ui-loser' })
  const requestId = await requestFor(request, client, 'symplektis')
  const winnerOffer = await makeOffer(request, winner, requestId)
  await makeOffer(request, loser, requestId)
  await acceptOffer(request, client, requestId, winnerOffer)

  await signInGarage(page, loser)
  await page.goto(`/garage-dashboard/${loser.id}/offers/${requestId}/`)
  await expect(page.getByTestId('assigned-elsewhere')).toContainText('Ο πελάτης επέλεξε άλλη προσφορά', { timeout: 60_000 })
  await expect.poll(
    async () => (await summary(request, loser.token)).alerts.some((a) => a.kind === 'offer-lost'),
    { timeout: 30_000 }
  ).toBe(false)
})

test('A first quote starts from what the garage charged last time for the same job on the same model', async ({ request }) => {
  const client = await newClient(request, 'suggest')
  const garage = await newGarage(request, { prefix: 'suggest' })
  const yaris = { brand: 'Toyota', model: 'Yaris' }

  const earlier = await requestFor(request, client, 'symplektis', yaris)
  expect((await offer(request, garage, earlier, { offerAmount: 345 })).status()).toBe(200)

  const suggestion = async (requestId: string) => {
    const resp = await request.get(`/api/garage/offer-suggestion/?requestId=${requestId}`, { headers: cookie(garage.token) })
    expect(resp.status()).toBe(200)
    return (await resp.json()).suggestion
  }

  expect((await suggestion(await requestFor(request, client, 'symplektis', yaris)))?.amount).toBe(345)
  // Another job on the same car, or the same job on another car: nothing to go by.
  expect(await suggestion(await requestFor(request, client, 'imantas', yaris))).toBeNull()
  expect(await suggestion(await requestFor(request, client, 'symplektis', { brand: 'Toyota', model: 'Corolla' }))).toBeNull()

  // Only the garage's own quotes: another garage gets nothing from this one's.
  const other = await newGarage(request, { prefix: 'suggest-other' })
  const resp = await request.get(`/api/garage/offer-suggestion/?requestId=${earlier}`, { headers: cookie(other.token) })
  expect((await resp.json()).suggestion).toBeNull()
})

test.describe('Requests reach a garage by the kind of shop it is', () => {
  test('paintwork only the Φανοποιεία, the rest the Συνεργεία, everything a garage that has not said', async ({ request }) => {
    const client = await newClient(request, 'routing')
    const bodyshop = await newGarage(request, { prefix: 'routing-body', businessTypes: ['bodywork'] })
    const mechanic = await newGarage(request, { prefix: 'routing-mech', businessTypes: ['mechanic'] })
    const both = await newGarage(request, { prefix: 'routing-both', businessTypes: ['mechanic', 'bodywork'] })
    const untyped = await newGarage(request, { prefix: 'routing-none' })
    const tyres = await newGarage(request, { prefix: 'routing-tyres', businessTypes: ['tyres'] })

    const paint = await requestFor(request, client, 'meriki-vafi')
    const clutch = await requestFor(request, client, 'symplektis')

    const feed = async (garage: TestGarage) => {
      const resp = await request.get('/api/garage/available-requests/?countOnly=1', { headers: cookie(garage.token) })
      expect(resp.status()).toBe(200)
      return new Set((await resp.json()).requestIds as string[])
    }
    const badge = async (garage: TestGarage) => new Set((await summary(request, garage.token)).availableRequestIds)

    for (const [garage, sees] of [
      [bodyshop, { paint: true, clutch: false }],
      [mechanic, { paint: false, clutch: true }],
      [both, { paint: true, clutch: true }],
      [untyped, { paint: true, clutch: true }],
      [tyres, { paint: false, clutch: false }],
    ] as const) {
      for (const ids of [await feed(garage), await badge(garage)]) {
        expect(ids.has(paint), `${garage.email} paint`).toBe(sees.paint)
        expect(ids.has(clutch), `${garage.email} clutch`).toBe(sees.clutch)
      }
    }
  })

  test('the summary hands the garage its types, for the live channel to filter by', async ({ request }) => {
    const bodyshop = await newGarage(request, { prefix: 'routing-types', businessTypes: ['bodywork'] })
    expect((await summary(request, bodyshop.token)).businessTypes).toEqual(['bodywork'])
  })
})

test.describe('The request form counts each field', () => {
  test('a field event is recorded only with its step, field and category', async ({ request }) => {
    const ok = await request.post('/api/track/', {
      data: { eventName: 'form_field_filled', metadata: { step: 'car_details', field: 'brand', category: 'symplektis' } },
    })
    expect(ok.status()).toBe(200)

    for (const metadata of [
      { step: 'checkout', field: 'brand', category: '' },
      { step: 'car_details', field: 'brand', category: 'symplektis', email: 'someone@example.com' },
      { step: 'car_details', field: '<script>', category: '' },
      undefined,
    ]) {
      const bad = await request.post('/api/track/', { data: { eventName: 'form_field_filled', metadata } })
      expect(bad.status(), JSON.stringify(metadata)).toBe(400)
    }
  })

  test('the admin report lists both steps field by field', async ({ request }) => {
    const login = await request.post('/api/admin/auth/login/', {
      data: { email: process.env.ADMIN_EMAIL || 'admin@nextservice.gr', password: process.env.ADMIN_PASSWORD || 'admin123' },
    })
    expect(login.status()).toBe(200)
    const resp = await request.get('/api/admin/funnel/fields/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.steps.map((s: { step: string }) => s.step)).toEqual(['car_details', 'car_specs'])
    expect(data.steps[0].fields.map((f: { field: string }) => f.field)).toEqual(['description', 'brand', 'model', 'year', 'engine_cc'])
  })
})

test.describe('Choosing between offers in the browser', () => {
  test('the client sees how many, from how much, sorts them, reads the note and confirms before booking', async ({ page, request }) => {
    const client = await newClient(request, 'compare')
    const cheap = await newGarage(request, { prefix: 'compare-cheap' })
    const dear = await newGarage(request, { prefix: 'compare-dear' })
    const requestId = await requestFor(request, client, 'symplektis')
    // The dearer one comes in first, so cheapest-first is a real reordering.
    expect((await offer(request, dear, requestId, { offerAmount: 420, notes: 'Κιτ LuK με ρουλεμάν.' })).status()).toBe(200)
    expect((await offer(request, cheap, requestId, { offerAmount: 310 })).status()).toBe(200)

    await loginAsClient(page, request, client.email, PASSWORD)
    await page.goto(`/requests/${client.clientId}/details/${requestId}/`)

    const summaryLine = page.getByTestId('offers-summary')
    await expect(summaryLine).toContainText('2 προσφορές', { timeout: 60_000 })
    await expect(summaryLine).toContainText('310')

    // Cheapest first, and the first card opens by itself.
    const titles = page.getByText(/^E2E Συνεργείο compare-/)
    await expect(titles.first()).toHaveText('E2E Συνεργείο compare-cheap')
    await page.getByTestId('offers-sort').getByRole('button', { name: 'Σειρά άφιξης' }).click()
    await expect(titles.first()).toHaveText('E2E Συνεργείο compare-dear')

    // The dearer garage's note, once its card is open.
    await titles.first().click()
    await expect(page.getByTestId('offer-notes')).toContainText('Κιτ LuK με ρουλεμάν.')

    // Booking goes through a confirmation sheet.
    const [y, m, d] = OFFER_DATES[0].split('-')
    await page.getByRole('button', { name: new RegExp(`${d}/${m}/${y}`) }).first().click()
    const hour = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()
    if (await hour.isVisible().catch(() => false)) await hour.click()
    await page.getByRole('button', { name: 'Αποδοχή προσφοράς' }).first().click()
    const sheet = page.getByTestId('booking-confirmation')
    await expect(sheet).toContainText('E2E Συνεργείο compare-dear')
    await expect(sheet).toContainText('Δεν υπάρχει προκαταβολή')

    // «Πίσω» books nothing.
    await page.getByRole('button', { name: 'Πίσω', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const stillPending = await request.get(`/api/requests/${requestId}/`, { headers: cookie(client.token) })
    expect((await stillPending.json()).request.status).toBe('pending')

    await page.getByRole('button', { name: 'Αποδοχή προσφοράς' }).first().click()
    const accepted = page.waitForResponse((r) => r.url().includes('/accept-offer/'))
    await page.getByRole('button', { name: 'Κλείσιμο ραντεβού' }).click()
    expect((await accepted).status()).toBe(200)
    await expect(sheet).toHaveCount(0)
  })

  test('the garage writes a note, starts from its last price, and can offer a weekend day', async ({ page, request }) => {
    const client = await newClient(request, 'garage-form')
    const garage = await newGarage(request, { prefix: 'garage-form' })
    const car = { brand: 'Opel', model: 'Corsa' }
    const earlier = await requestFor(request, client, 'imantas', car)
    expect((await offer(request, garage, earlier, { offerAmount: 275 })).status()).toBe(200)
    const requestId = await requestFor(request, client, 'imantas', car)

    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/offers/${requestId}/`)
    await expect(page.getByTestId('offer-amount-suggestion')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByPlaceholder('Ποσό σε €, χωρίς ΦΠΑ')).toHaveValue('275')

    await page.getByLabel('Σημείωση προς τον πελάτη').fill('Με αντλία νερού.')

    // Weekends are bookable now — just tinted.
    // react-day-picker puts the modifier class on the cell and marks a day it
    // will not take with data-disabled.
    const weekendCell = page.locator('.rdp-day.bg-primary-fixed\\/40:not([data-disabled])').first()
    await expect(weekendCell).toBeVisible()
    await weekendCell.getByRole('button').click()
    // Hours start unpicked; the grid labels each cell «<date> <hour> μη επιλεγμένη».
    await page.getByRole('button', { name: / \d{2}:\d{2} μη επιλεγμένη$/ }).first().click()

    const sent = page.waitForResponse((r) => r.url().includes('/api/offers') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Αποστολή Προσφοράς' }).click()
    const body = await (await sent).json()
    expect(body.offer.notes).toBe('Με αντλία νερού.')
    expect(body.offer.offerAmount).toBe(275)
    const day = new Date(`${body.offer.availabilityDates[0]}T12:00:00Z`).getUTCDay()
    expect([0, 6]).toContain(day)
  })
})
