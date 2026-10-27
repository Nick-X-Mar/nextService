import { test, expect } from '@playwright/test'
import {
  acceptOffer,
  ageAppointment,
  completeJob,
  cookie,
  makeOffer,
  newClient,
  newGarage,
  newRequest,
  postMessage,
  signInGarage,
  summary,
  summaryUntil,
  athensDatePlus,
} from './E-helpers'

/**
 * The garage's standing alerts: each must appear when its condition holds and
 * — just as important — go away once it no longer does. An alert that can't be
 * cleared becomes wallpaper.
 *
 * Every test uses its own freshly approved garage: the shared TEST_GARAGE
 * carries every job every other spec ever booked, so its alert list is never
 * in a known state.
 */

test('The "proposed dates" alert appears once the client proposes dates on the offer, and clears once seen', async ({ request }) => {
  const client = await newClient(request, 'dates')
  const garage = await newGarage(request, { prefix: 'dates' })
  const requestId = await newRequest(request, client, { brand: 'Honda', model: 'Jazz' })
  const offerId = await makeOffer(request, garage, requestId)

  const before = await summary(request, garage.token)
  expect(before.alerts.some((a) => a.kind === 'client-dates')).toBe(false)

  const propose = await request.patch(`/api/offers/${offerId}/client-availability/`, {
    headers: cookie(client.token),
    data: { clientAvailabilityDates: [athensDatePlus(5), athensDatePlus(6)] },
  })
  expect(propose.status()).toBe(200)

  // The dates are written to the offer; the alert used to read them off the
  // request and so never fired. (That route does not invalidate the garage's
  // cached summary, hence the wait.)
  const after = await summaryUntil(request, garage.token, (s) => s.alerts.some((a) => a.kind === 'client-dates'))
  const alert = after.alerts.find((a) => a.kind === 'client-dates')
  expect(alert, JSON.stringify(after.alerts)).toBeTruthy()
  expect(alert!.href).toBe(`/garage-dashboard/${garage.id}/offers/${requestId}/`)
  expect(alert!.detail).toBe('Honda Jazz')
  expect(after.offersNeedingAttention).toBe(1)

  const seen = await request.post('/api/notifications/seen/', {
    headers: cookie(garage.token),
    data: { kind: 'dates', id: offerId },
  })
  expect(seen.status()).toBe(200)
  const cleared = await summary(request, garage.token)
  expect(cleared.alerts.some((a) => a.kind === 'client-dates')).toBe(false)
})

test('The "offer accepted" alert clears when the job is completed, without opening the offer', async ({ request }) => {
  const client = await newClient(request, 'accepted')
  const garage = await newGarage(request, { prefix: 'accepted' })
  const requestId = await newRequest(request, client, { brand: 'Mazda', model: 'CX-5' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)

  const accepted = await summaryUntil(request, garage.token, (s) => s.alerts.some((a) => a.kind === 'offer-accepted'))
  const alert = accepted.alerts.find((a) => a.kind === 'offer-accepted')
  expect(alert, JSON.stringify(accepted.alerts)).toBeTruthy()
  // The request row carries only a vehicleId; the alert still names the car.
  expect(alert!.detail).toBe('Mazda CX-5')

  await ageAppointment(requestId, offerId)
  await completeJob(request, garage, requestId)

  const after = await summary(request, garage.token)
  expect(after.alerts.some((a) => a.kind === 'offer-accepted')).toBe(false)
  expect(after.alerts.some((a) => a.kind === 'appointment-soon')).toBe(false)
})

test('The "offer accepted" alert clears when the appointment is cancelled', async ({ request }) => {
  const client = await newClient(request, 'accepted-cancel')
  const garage = await newGarage(request, { prefix: 'accepted-cancel' })
  const requestId = await newRequest(request, client)
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await summaryUntil(request, garage.token, (s) => s.alerts.some((a) => a.kind === 'offer-accepted'))

  const cancel = await request.patch(`/api/requests/${requestId}/cancel/`, { headers: cookie(client.token), data: {} })
  expect(cancel.status()).toBe(200)

  const after = await summaryUntil(request, garage.token, (s) => !s.alerts.some((a) => a.kind === 'offer-accepted'))
  expect(after.alerts.some((a) => a.kind === 'offer-accepted')).toBe(false)
})

test('An appointment tomorrow, in Athens, raises "Ραντεβού αύριο"', async ({ request }) => {
  const client = await newClient(request, 'soon')
  const garage = await newGarage(request, { prefix: 'soon' })
  const requestId = await newRequest(request, client, { brand: 'Dacia', model: 'Duster' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  // Move it to tomorrow's Athens date (the API books the offer's dates only).
  await ageAppointment(requestId, offerId, -1)

  const s = await summaryUntil(request, garage.token, (x) => x.alerts.some((a) => a.kind === 'appointment-soon'))
  const alert = s.alerts.find((a) => a.kind === 'appointment-soon')
  expect(alert?.title).toBe('Ραντεβού αύριο')
  expect(alert?.detail).toBe('Dacia Duster')
})

test('A garage can review the client from the job chat, and the review alert clears', async ({ page, request }) => {
  const client = await newClient(request, 'gr-review')
  const garage = await newGarage(request, { prefix: 'gr-review' })
  const requestId = await newRequest(request, client, { brand: 'Volvo', model: 'V40' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await ageAppointment(requestId, offerId)
  // Completed without the optional rating — the case that left the alert
  // stuck for 30 days, because nothing on the garage side could submit one.
  await completeJob(request, garage, requestId)

  const due = await summary(request, garage.token)
  const alert = due.alerts.find((a) => a.kind === 'review-due')
  expect(alert, JSON.stringify(due.alerts)).toBeTruthy()
  expect(alert!.href).toBe(`/garage-dashboard/${garage.id}/chat/${requestId}/`)
  expect(alert!.detail).toBe('Volvo V40')

  // The appointments chat list marks the job as owed a review.
  const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(garage.token) })).json()
  expect(list.appointments.find((t: { requestId: string }) => t.requestId === requestId)?.needsReview).toBe(true)

  await signInGarage(page, garage)
  await page.goto(alert!.href)

  await expect(page.getByRole('heading', { name: 'Αξιολόγηση' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Αξιολόγησε τον πελάτη', { exact: false })).toBeVisible()
  await page.getByRole('radio', { name: '5 αστέρια' }).click()
  await page.getByRole('button', { name: 'Ήρθε στην ώρα του' }).click()
  // Wait for the write itself. The form's own intro reads "Η αξιολόγησή σου
  // εμφανίζεται…", so waiting on that text alone returned at once and the
  // summary below raced the POST — which is why this test failed every run.
  const posted = page.waitForResponse(
    (r) => r.url().includes(`/api/requests/${requestId}/review/`) && r.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Υποβολή' }).click()
  expect((await posted).status()).toBe(200)
  await expect(page.getByText('Η αξιολόγησή σου', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Immediately: the review route invalidates the garage's summary, and a
  // summary the open page was computing from before the write must not be the
  // one that gets cached (see ttlCache's generations).
  const after = await summary(request, garage.token)
  expect(after.alerts.some((a) => a.kind === 'review-due')).toBe(false)

  // The write really landed as the garage's review of the client.
  const review = await (await request.get(`/api/requests/${requestId}/review/`, { headers: cookie(garage.token) })).json()
  expect(review.mine?.rating).toBe(5)
  expect(review.canReview).toBe(false)
})

test("The garage's chat lists show yesterday's appointment and link to each other", async ({ page, request }) => {
  const client = await newClient(request, 'lists')
  const garage = await newGarage(request, { prefix: 'lists' })
  const requestId = await newRequest(request, client, { brand: 'Seat', model: 'Leon' })
  const offerId = await makeOffer(request, garage, requestId)
  await acceptOffer(request, client, requestId, offerId)
  await ageAppointment(requestId, offerId, 1)
  expect((await postMessage(request, client.token, requestId, 'Πότε να περάσω να το πάρω;', garage.id)).status()).toBe(200)

  await signInGarage(page, garage)
  // Where the "νέο μήνυμα" badge and banner send a garage on a phone.
  await page.goto(`/garage-dashboard/${garage.id}/chats/`)
  const toAppointments = page.getByRole('tab', { name: /Ραντεβού/ })
  await expect(toAppointments).toContainText('1', { timeout: 30_000 })
  await toAppointments.click()

  await page.waitForURL(/\/chats\/appointments\/$/)
  const card = page.locator(`[data-request-id="${requestId}"]`)
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card).toContainText('Seat Leon')
  await expect(card).toContainText('Εκκρεμεί η ολοκλήρωση')

  await card.click()
  await page.waitForURL(new RegExp(`/chat/${requestId}/$`))
  await expect(page.getByText('Πότε να περάσω να το πάρω;')).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => (await summary(request, garage.token)).threads, { timeout: 15_000 }).toBe(0)
})

test('Marking a notification seen with an empty or malformed body is a 400, not a 500', async ({ request }) => {
  const client = await newClient(request, 'seen-empty')
  for (const data of ['', 'null', '[]', '{"kind":"offers"}']) {
    const resp = await request.post('/api/notifications/seen/', {
      headers: { ...cookie(client.token), 'Content-Type': 'application/json' },
      data,
    })
    expect(resp.status(), `body: ${JSON.stringify(data)}`).toBe(400)
  }
})
