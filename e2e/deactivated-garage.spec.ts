import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  acceptOffer,
  ageAppointment,
  cookie,
  loginAdmin,
  makeOffer,
  newClient,
  newGarage,
  newRequest,
  setClientName,
  signInGarage,
  type TestClient,
  type TestGarage,
} from './E-helpers'

/**
 * A garage an admin deactivates keeps the jobs it had already booked. It must
 * still be able to close them — otherwise they sit in APPOINTMENT for good: no
 * commission, no review, and the client can no longer cancel once the slot
 * has started — but it must not get back onto the marketplace or see more of
 * the client than the job needs.
 */

async function deactivate(request: APIRequestContext, garageId: string) {
  const admin = await loginAdmin(request)
  const resp = await request.post(`/api/admin/users/garages/${garageId}/deactivate/`, {
    headers: { Cookie: admin },
  })
  expect(resp.status(), await resp.text()).toBe(200)
}

/** A garage with one job booked for two days ago, then deactivated. */
async function deactivatedWithPastBooking(request: APIRequestContext) {
  const client = await newClient(request, 'deact-client')
  await setClientName(client.clientId, 'Σοφία', 'Απενεργοπούλου')
  const garage = await newGarage(request, { prefix: 'deact' })
  const requestId = await newRequest(request, client, { brand: 'Fiat', model: 'Panda' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await ageAppointment(requestId, offerId, 2)
  await deactivate(request, garage.id)
  return { client, garage, requestId }
}

test.describe.serial('A deactivated garage with a booking it has not closed', () => {
  let client: TestClient
  let garage: TestGarage
  let requestId: string

  test.beforeAll(async ({ request }) => {
    ;({ client, garage, requestId } = await deactivatedWithPastBooking(request))
  })

  test('booked-jobs lists the job with only what closing it needs; the marketplace stays shut', async ({ request }) => {
    const resp = await request.get('/api/garage/booked-jobs/', { headers: cookie(garage.token) })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.account).toBe('deactivated')
    expect(data.jobs).toHaveLength(1)
    expect(data.jobs[0]).toMatchObject({ requestId, clientFirstName: 'Σοφία', price: 150 })
    expect(data.jobs[0].vehicle).toMatchObject({ brand: 'Fiat', model: 'Panda' })
    // Nothing beyond the first name: no surname, phone, email or plate.
    const raw = JSON.stringify(data)
    expect(raw).not.toContain('Απενεργοπούλου')
    expect(raw).not.toContain(client.email)
    expect(raw).not.toMatch(/phoneNumber|licensePlate|lastName/)

    const feed = await request.get(`/api/garage/available-requests?garageId=${garage.id}`, {
      headers: cookie(garage.token),
    })
    expect(feed.status()).toBe(403)
    expect((await feed.json()).code).toBe('GARAGE_INACTIVE')
  })

  test('the dashboard says it is deactivated and closes the job from there', async ({ page, request }) => {
    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/`)

    await expect(page.getByRole('heading', { name: 'Ο λογαριασμός σας έχει απενεργοποιηθεί' })).toBeVisible({
      timeout: 45_000,
    })
    // Not the "application under review" copy a never-approved garage gets.
    await expect(page.getByText('Η αίτησή σας εξετάζεται')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Νέα Αιτήματα' })).toHaveCount(0)

    const job = page.getByTestId('booked-job')
    await expect(job).toHaveCount(1)
    await expect(job).toContainText('Fiat Panda')
    await expect(job).toContainText('Σοφία')
    await expect(job).not.toContainText('Απενεργοπούλου')

    await job.getByRole('button', { name: 'Δήλωσέ το' }).click()
    const completed = page.waitForResponse(
      (r) => r.url().includes(`/api/requests/${requestId}/complete`) && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Καταχώρηση' }).click()
    expect((await completed).status()).toBe(200)

    // Closed: it leaves the list, and the request is COMPLETED for the client too.
    await expect(page.getByTestId('booked-job')).toHaveCount(0, { timeout: 15_000 })
    const detail = await request.get(`/api/requests/${requestId}/`, { headers: cookie(client.token) })
    expect((await detail.json()).request?.status).toBe('completed')

    const after = await request.get('/api/garage/booked-jobs/', { headers: cookie(garage.token) })
    expect((await after.json()).jobs).toHaveLength(0)
  })
})

test('A booking that is not due yet is listed, but cannot be declared before its slot', async ({ page, request }) => {
  const client = await newClient(request, 'deact-future')
  const garage = await newGarage(request, { prefix: 'deact-future' })
  const requestId = await newRequest(request, client, { brand: 'Opel', model: 'Corsa' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await deactivate(request, garage.id)

  await signInGarage(page, garage)
  await page.goto(`/garage-dashboard/${garage.id}/`)
  const job = page.getByTestId('booked-job')
  await expect(job).toHaveCount(1, { timeout: 45_000 })
  await expect(job).toContainText('Opel Corsa')
  await expect(job.getByRole('button', { name: 'Δήλωσέ το' })).toHaveCount(0)
  await expect(job).toContainText('Η δήλωση ανοίγει μετά το ραντεβού')
})

test('A garage still awaiting its first approval is "pending", with no bookings', async ({ page, request }) => {
  const pending = await newGarage(request, { active: false, prefix: 'deact-pending' })
  const resp = await request.get('/api/garage/booked-jobs/', { headers: cookie(pending.token) })
  expect(resp.status()).toBe(200)
  expect(await resp.json()).toMatchObject({ account: 'pending', jobs: [] })

  await signInGarage(page, pending)
  await page.goto(`/garage-dashboard/${pending.id}/`)
  await expect(page.getByRole('heading', { name: 'Η αίτησή σας εξετάζεται' })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('Κλεισμένα ραντεβού')).toHaveCount(0)
})

test('booked-jobs needs a garage session', async ({ request }) => {
  expect((await request.get('/api/garage/booked-jobs/')).status()).toBe(401)
  const client = await newClient(request, 'deact-not-garage')
  const asClient = await request.get('/api/garage/booked-jobs/', { headers: cookie(client.token) })
  expect(asClient.status()).toBe(403)
})
