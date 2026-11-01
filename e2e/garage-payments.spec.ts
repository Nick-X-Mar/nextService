import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  acceptOffer,
  ageAppointment,
  athensDatePlus,
  cookie,
  loginAdmin,
  makeOffer,
  newClient,
  newGarage,
  newRequest,
  signInGarage,
  summaryUntil,
  type TestClient,
  type TestGarage,
} from './E-helpers'
import { getServiceRequest } from './dynamo-helpers'
import { setAuthCookie } from './helpers'

/**
 * A garage saying it cannot take a request, the reasons behind a closed job,
 * and the two Πληρωμές pages built on them: the garage's (commission owed,
 * payments declared, an admin's check of each) and the client's (what was
 * charged, and their word on it).
 */

/** A job booked at the 150€ quote and moved into the past, ready to be closed. */
async function bookedJob(request: APIRequestContext, prefix: string) {
  const client = await newClient(request, prefix)
  const garage = await newGarage(request, { prefix })
  const requestId = await newRequest(request, client)
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await ageAppointment(requestId, offerId)
  return { client, garage, requestId, offerId }
}

function complete(request: APIRequestContext, garage: TestGarage, requestId: string, data: Record<string, unknown>) {
  return request.post(`/api/requests/${requestId}/complete/`, { headers: cookie(garage.token), data })
}

function decline(request: APIRequestContext, garage: TestGarage, data: Record<string, unknown>) {
  return request.post('/api/garage/declines/', { headers: cookie(garage.token), data })
}

async function feedIds(request: APIRequestContext, garage: TestGarage): Promise<string[]> {
  const resp = await request.get('/api/garage/available-requests/?countOnly=1', { headers: cookie(garage.token) })
  expect(resp.status()).toBe(200)
  return (await resp.json()).requestIds
}

async function ledger(request: APIRequestContext, garage: TestGarage) {
  const resp = await request.get('/api/garage/payments/', { headers: cookie(garage.token) })
  expect(resp.status(), await resp.text()).toBe(200)
  return resp.json()
}

test.describe('A garage declines a request', () => {
  test('The request leaves its feed and badge and is listed with the reason', async ({ request }) => {
    const client = await newClient(request, 'decline')
    const garage = await newGarage(request, { prefix: 'decline' })
    const requestId = await newRequest(request, client)
    expect(await feedIds(request, garage)).toContain(requestId)

    expect((await decline(request, garage, { requestId, reason: 'whatever' })).status()).toBe(400)
    expect((await decline(request, garage, { requestId, reason: 'other' })).status()).toBe(400)

    const first = await decline(request, garage, { requestId, reason: 'other', reasonText: 'Λείπει ο μάστορας' })
    expect(first.status(), await first.text()).toBe(200)
    // A double tap answers the same way and writes nothing new.
    expect((await decline(request, garage, { requestId, reason: 'no_capacity' })).status()).toBe(200)

    expect(await feedIds(request, garage)).not.toContain(requestId)
    const s = await summaryUntil(request, garage.token, (x) => !x.availableRequestIds.includes(requestId))
    expect(s.availableRequestIds).not.toContain(requestId)

    const offers = await (await request.get('/api/garage/offers/', { headers: cookie(garage.token) })).json()
    const declined = offers.declines.find((d: { requestId: string }) => d.requestId === requestId)
    expect(declined).toMatchObject({ reason: 'other', reasonText: 'Λείπει ο μάστορας' })
    // The quoting view only: the client's surname never reaches a garage that did not win.
    expect(declined.serviceRequest.client?.lastName).toBeUndefined()

    // Another garage still sees it, and the client still waits for offers.
    const other = await newGarage(request, { prefix: 'decline-other' })
    expect(await feedIds(request, other)).toContain(requestId)
  })

  test('A garage cannot decline a request it quoted, or one that is no longer open', async ({ request }) => {
    const { garage, requestId } = await bookedJob(request, 'decline-closed')
    expect((await decline(request, garage, { requestId, reason: 'parts' })).status()).toBe(409)

    const client = await newClient(request, 'decline-quoted')
    const open = await newRequest(request, client)
    const shop = await newGarage(request, { prefix: 'decline-quoted' })
    await makeOffer(request, shop, open)
    expect((await decline(request, shop, { requestId: open, reason: 'parts' })).status()).toBe(409)
  })

  test('UI: declining from the feed moves the card to Προσφορές → Απορριφθείσες', async ({ page, request }) => {
    const client = await newClient(request, 'decline-ui')
    const garage = await newGarage(request, { prefix: 'decline-ui' })
    // A model no other spec uses, so this card can be found among the whole market.
    const model = `Decline${Date.now()}`
    await newRequest(request, client, { brand: 'Skoda', model })

    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/?tab=requests`)
    const card = page.locator('article').filter({ hasText: model })
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.getByRole('button', { name: 'Δεν μπορώ να το αναλάβω' }).click()

    await page.getByRole('button', { name: 'Απόρριψη αιτήματος' }).click()
    await expect(page.getByText('Διάλεξε τον λόγο.')).toBeVisible()
    await page.getByLabel('Δεν κάνουμε αυτή την εργασία').check()
    await page.getByRole('button', { name: 'Απόρριψη αιτήματος' }).click()
    await expect(card).toBeHidden({ timeout: 15_000 })

    await page.goto(`/garage-dashboard/${garage.id}/?tab=offers`)
    await page.getByRole('button', { name: 'Απορριφθείσες' }).click()
    const declined = page.getByTestId('declined-request').filter({ hasText: model })
    await expect(declined).toBeVisible({ timeout: 15_000 })
    await expect(declined).toContainText('Δεν κάνουμε αυτή την εργασία')
    await page.getByRole('button', { name: 'Ολοκληρωμένες' }).click()
    await expect(declined).toBeHidden()
  })
})

test.describe('Why a job did not happen, or cost less', () => {
  test('A job that did not happen needs a reason that matches the outcome', async ({ request }) => {
    const { garage, requestId } = await bookedJob(request, 'reason-notdone')
    expect((await complete(request, garage, requestId, { outcome: 'no_show' })).status()).toBe(400)
    // Only "δεν ήρθε" is a no-show.
    expect((await complete(request, garage, requestId, { outcome: 'no_show', reason: { code: 'parts' } })).status()).toBe(400)
    expect((await complete(request, garage, requestId, { outcome: 'not_done', reason: { code: 'other' } })).status()).toBe(400)

    const ok = await complete(request, garage, requestId, { outcome: 'not_done', reason: { code: 'parts' } })
    expect(ok.status(), await ok.text()).toBe(200)
    const row = await getServiceRequest(requestId)
    expect(row?.completionOutcome).toBe('not_done')
    expect(row?.completionReason).toEqual({ kind: 'not_done', code: 'parts' })
  })

  test('Less than the quote needs a reason; the quote or more does not', async ({ request }) => {
    const lower = await bookedJob(request, 'reason-lower')
    const net100 = { outcome: 'completed', amount: 100, vatIncluded: false }
    const refused = await complete(request, lower.garage, lower.requestId, net100)
    expect(refused.status()).toBe(400)
    expect((await refused.json()).error).toContain('μικρότερο από την προσφορά')

    const ok = await complete(request, lower.garage, lower.requestId, { ...net100, reason: { code: 'discount' } })
    expect(ok.status(), await ok.text()).toBe(200)
    expect((await getServiceRequest(lower.requestId))?.completionReason).toEqual({ kind: 'lower_amount', code: 'discount' })

    const same = await bookedJob(request, 'reason-same')
    const quote = await complete(request, same.garage, same.requestId, { outcome: 'completed', amount: 150, vatIncluded: false })
    expect(quote.status(), await quote.text()).toBe(200)
    expect((await getServiceRequest(same.requestId))?.completionReason).toBeUndefined()
  })
})

test.describe.serial('Πληρωμές', () => {
  let client: TestClient
  let garage: TestGarage
  let requestId: string
  let settlementId: string
  let admin: string

  test('Setup: one job closed at 200€ net', async ({ request }) => {
    ;({ client, garage, requestId } = await bookedJob(request, 'ledger'))
    const done = await complete(request, garage, requestId, { outcome: 'completed', amount: 200, vatIncluded: false })
    expect(done.status(), await done.text()).toBe(200)
    admin = await loginAdmin(request)
  })

  test('The garage sees the job and the 15% commission it owes', async ({ request }) => {
    const data = await ledger(request, garage)
    const job = data.jobs.find((j: { requestId: string }) => j.requestId === requestId)
    expect(job).toMatchObject({
      state: 'completed',
      quoted: 150,
      declared: { net: 200, vat: 48, gross: 248 },
      commission: 30,
      commissionPercent: 15,
    })
    expect(data.totals).toEqual({ commission: 30, paid: 0, paidUnconfirmed: 0, balance: 30 })
    // Someone else's books are not reachable: the garage is the session's.
    const other = await newGarage(request, { prefix: 'ledger-other' })
    expect((await ledger(request, other)).jobs).toEqual([])
  })

  test('A declared payment counts at once; an admin confirms or rejects it', async ({ request }) => {
    const pay = (data: Record<string, unknown>) =>
      request.post('/api/garage/payments/', { headers: cookie(garage.token), data })
    const today = athensDatePlus(0)
    expect((await pay({ amount: 0, paidOn: today, method: 'bank_transfer' })).status()).toBe(400)
    expect((await pay({ amount: 20, paidOn: athensDatePlus(2), method: 'bank_transfer' })).status()).toBe(400)
    expect((await pay({ amount: 20, paidOn: today, method: 'bitcoin' })).status()).toBe(400)

    const declared = await pay({ amount: 20, paidOn: today, method: 'bank_transfer', reference: 'ΤΡ-123' })
    expect(declared.status(), await declared.text()).toBe(200)
    settlementId = (await declared.json()).settlement.settlementId
    expect((await ledger(request, garage)).totals).toEqual({ commission: 30, paid: 20, paidUnconfirmed: 20, balance: 10 })

    const queue = await (await request.get('/api/admin/commissions/settlements/', { headers: { Cookie: admin } })).json()
    expect(queue.settlements.map((s: { settlementId: string }) => s.settlementId)).toContain(settlementId)
    // Admin-only.
    expect((await request.get('/api/admin/commissions/settlements/', { headers: cookie(garage.token) })).status()).toBe(401)

    const review = (decision: string) =>
      request.put(`/api/admin/commissions/settlements/${settlementId}/`, { headers: { Cookie: admin }, data: { decision } })
    expect((await review('rejected')).status()).toBe(200)
    expect((await ledger(request, garage)).totals).toEqual({ commission: 30, paid: 0, paidUnconfirmed: 0, balance: 30 })
    expect((await review('confirmed')).status()).toBe(200)
    expect((await ledger(request, garage)).totals).toEqual({ commission: 30, paid: 20, paidUnconfirmed: 0, balance: 10 })
    expect((await request.put('/api/admin/commissions/settlements/stl_nope/', {
      headers: { Cookie: admin }, data: { decision: 'confirmed' },
    })).status()).toBe(404)

    const detail = await (await request.get(`/api/admin/commissions/garage/${garage.id}/`, { headers: { Cookie: admin } })).json()
    expect(detail.ledger.totals.balance).toBe(10)
  })

  test('The client sees what was charged and confirms it once', async ({ request }) => {
    const jobs = await (await request.get('/api/requests/jobs/', { headers: cookie(client.token) })).json()
    const job = jobs.jobs.find((j: { requestId: string }) => j.requestId === requestId)
    expect(job).toMatchObject({ state: 'completed', quoted: 150, declared: { gross: 248 }, canConfirm: true })
    // A garage's location reaches the client as its Δήμος at most, never an address.
    expect(JSON.stringify(job.garage)).not.toContain('Οδός')

    const alerts = await summaryUntil(request, client.token, (s) => s.alerts.some((a) => a.kind === 'job-confirm'))
    expect(alerts.alerts.find((a) => a.kind === 'job-confirm')?.href).toBe(`/requests/${client.clientId}/payments/`)

    const confirm = (who: TestClient, data: Record<string, unknown>) =>
      request.post(`/api/requests/${requestId}/confirm/`, { headers: cookie(who.token), data })
    const stranger = await newClient(request, 'ledger-stranger')
    expect((await confirm(stranger, { status: 'confirmed' })).status()).toBe(409)
    expect((await confirm(client, { status: 'disputed' })).status()).toBe(400)

    expect((await confirm(client, { status: 'disputed', amountPaid: 300, note: 'Πλήρωσα παραπάνω' })).status()).toBe(200)
    expect((await confirm(client, { status: 'confirmed' })).status()).toBe(409)

    const after = await (await request.get('/api/requests/jobs/', { headers: cookie(client.token) })).json()
    expect(after.jobs.find((j: { requestId: string }) => j.requestId === requestId)).toMatchObject({
      canConfirm: false,
      confirmation: { status: 'disputed', amountPaid: 300, note: 'Πλήρωσα παραπάνω' },
    })
    // The admin page is per month: the job's, which is not always this one.
    const month = String((await getServiceRequest(requestId))?.appointmentDate).slice(0, 7)
    const detail = await (await request.get(`/api/admin/commissions/garage/${garage.id}/?month=${month}`, {
      headers: { Cookie: admin },
    })).json()
    expect(detail.appointments.find((a: { requestId: string }) => a.requestId === requestId)?.clientConfirmation)
      .toMatchObject({ status: 'disputed', amountPaid: 300 })
    expect((await ledger(request, garage)).jobs[0].clientConfirmation).toBe('disputed')
  })

  test('UI: the garage reads its balance and declares a payment', async ({ page }) => {
    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/?tab=payments`)
    await expect(page.getByTestId('ledger-balance')).toHaveText(/10,00€/, { timeout: 20_000 })
    await expect(page.getByTestId('ledger-job')).toContainText('30,00€')
    await expect(page.getByTestId('settlement')).toContainText('Επιβεβαιώθηκε')

    await page.getByRole('button', { name: 'Ακυρωμένες' }).click()
    await expect(page.getByTestId('ledger-job')).toHaveCount(0)
    await page.getByRole('button', { name: 'Εκτελεσμένες' }).click()
    await expect(page.getByTestId('ledger-job')).toHaveCount(1)

    await page.getByRole('button', { name: 'Δήλωση πληρωμής' }).click()
    // Offered the balance it owes.
    await expect(page.getByLabel(/^Ποσό/)).toHaveValue('10.00')
    await page.getByRole('button', { name: 'Καταχώρηση' }).click()
    await expect(page.getByTestId('ledger-balance')).toHaveText(/0,00€/, { timeout: 15_000 })
    await expect(page.getByTestId('settlement').first()).toContainText('Σε έλεγχο')
  })

  test('UI: the closed job is under Προσφορές → Ολοκληρωμένες', async ({ page }) => {
    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/?tab=offers`)
    await page.getByRole('button', { name: 'Ολοκληρωμένες' }).click()
    const card = page.locator('article').filter({ hasText: 'Ολοκληρώθηκε' })
    await expect(card).toHaveCount(1, { timeout: 15_000 })
    // The declared net, not the quote.
    await expect(card).toContainText('200')
    await page.getByRole('button', { name: 'Εκκρεμείς' }).click()
    await expect(card).toHaveCount(0)
  })

  test('UI: the client reads the charge on its Πληρωμές page', async ({ page }) => {
    await setAuthCookie(page, client.token)
    await page.goto(`/requests/${client.clientId}/payments/`)
    const job = page.getByTestId('client-job').first()
    await expect(job).toContainText('248,00€', { timeout: 20_000 })
    await expect(job).toContainText('Δηλώσατε διαφωνία')
    await expect(page.getByTestId('client-paid-total')).toHaveText('248,00€')
  })
})

test('A deactivated garage still sees what it owes and can declare a payment', async ({ page, request }) => {
  const { garage, requestId } = await bookedJob(request, 'ledger-deactivated')
  expect((await complete(request, garage, requestId, { outcome: 'completed', amount: 100, vatIncluded: false, reason: { code: 'less_work' } })).status()).toBe(200)
  // The way an admin does it, so the dashboard reads "deactivated", not "pending".
  const deactivated = await request.post(`/api/admin/users/garages/${garage.id}/deactivate/`, {
    headers: { Cookie: await loginAdmin(request) },
  })
  expect(deactivated.status(), await deactivated.text()).toBe(200)

  expect((await ledger(request, garage)).totals.balance).toBe(15)
  await signInGarage(page, garage)
  await page.goto(`/garage-dashboard/${garage.id}/`)
  await page.getByRole('button', { name: 'Πληρωμές' }).click()
  await expect(page.getByTestId('ledger-balance')).toHaveText(/15,00€/, { timeout: 20_000 })
  await expect(page.getByTestId('ledger-job')).toContainText('Χρειάστηκε λιγότερη δουλειά')
})

test('UI: scrolling over an amount field leaves the amount alone', async ({ page, request }) => {
  const client = await newClient(request, 'wheel')
  const garage = await newGarage(request, { prefix: 'wheel' })
  const requestId = await newRequest(request, client)
  await signInGarage(page, garage)
  await page.goto(`/garage-dashboard/${garage.id}/offers/${requestId}/`)
  const price = page.getByPlaceholder('Ποσό σε €, χωρίς ΦΠΑ')
  await price.fill('150')
  await price.hover()
  await page.mouse.wheel(0, 300)
  await page.mouse.wheel(0, -300)
  await expect(price).toHaveValue('150')
  await expect(price).not.toBeFocused()
})

test('UI: on a phone the admin menu is a drawer behind the menu button', async ({ page, request, baseURL }) => {
  const admin = await loginAdmin(request)
  await page.context().addCookies([{ name: 'ns-admin-session', value: admin.split('=')[1], url: baseURL! }])
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/admin/commissions/')
  const link = page.getByRole('link', { name: 'Garages' })
  await expect(page.getByRole('button', { name: 'Μενού', exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(link).not.toBeInViewport()
  // Nothing is pushed sideways by a menu that is not showing.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

  await page.getByRole('button', { name: 'Μενού', exact: true }).click()
  await expect(link).toBeInViewport()
  await link.click()
  await expect(page).toHaveURL(/\/admin\/garages/)
  await expect(page.getByRole('link', { name: 'Garages' })).not.toBeInViewport()
})
