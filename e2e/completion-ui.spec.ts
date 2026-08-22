import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsClient, loginAsGarage, TEST_GARAGE } from './helpers'
import { ageAppointment } from './dynamo-helpers'

/**
 * The journey a real garage and a real client take after an appointment.
 *
 * Driven through the UI rather than the API, because the surfaces are the part
 * that did not exist: the garage's Appointments tab used to discard every past
 * appointment, so there was nowhere in the app to say a job had happened.
 */

const PASSWORD = 'TestPass123'
const FUTURE_DATES = ['2027-06-10', '2027-06-11']

test('A garage closes a past appointment from the dashboard and the client reviews it', async ({
  page,
  request,
  context,
}) => {
  const stamp = Date.now()
  // Unique per run: the awaiting list holds every past appointment this garage
  // has not closed, including ones earlier runs of this very test created.
  const model = `Micra-${stamp}`
  const email = `e2e-ui-${stamp}@test.com`
  const reg = await registerClient(request, email, PASSWORD)
  const clientId: string = reg.client.id
  const clientToken = (await loginViaAPI(request, email, PASSWORD, 'client')).token
  const garageToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token

  const sr = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${clientToken}` },
    data: {
      clientId, category: 'allagi-ladion', description: 'E2E completion UI',
      brand: 'Nissan', model, modelYear: '2019', engineCC: '1000',
      fuelType: 'petrol', isAutomatic: false, is4x4: false,
    },
  })
  const requestId: string = (await sr.json()).serviceRequestId

  const offer = await request.post('/api/offers', {
    headers: { Cookie: `auth-token=${garageToken}` },
    data: { serviceRequestId: requestId, offerAmount: 180, benefits: [], availableDates: FUTURE_DATES },
  })
  const offerId = (await offer.json()).offer.id

  await request.patch(`/api/requests/${requestId}/accept-offer/`, {
    headers: { Cookie: `auth-token=${clientToken}` },
    data: { offerId, appointmentDate: FUTURE_DATES[0], appointmentTime: '11:00', appointmentPrice: 180 },
  })

  // The appointment has to be in the past for the prompt to open, and booking
  // one in the past is (correctly) impossible through the API.
  await ageAppointment(requestId, 2)

  // ── Garage: close the job ───────────────────────────────────────────────
  await loginAsGarage(page, request)
  await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/?tab=appointments`)

  // Scope to the section: the standing alert banner carries a CTA with the
  // same label, and clicking that navigates instead of opening the modal.
  const awaiting = page.locator('section', {
    has: page.getByRole('heading', { name: 'Περιμένουν ολοκλήρωση' }),
  })
  await expect(awaiting).toBeVisible({ timeout: 20_000 })

  // Target this test's own appointment by vehicle: the list legitimately holds
  // every past appointment the garage has not closed.
  // The innermost element holding both the vehicle and its own button — i.e.
  // that appointment's row, not an ancestor and not the text node.
  const row = awaiting
    .locator('div')
    .filter({ hasText: model })
    .filter({ has: page.getByRole('button', { name: 'Δήλωσε το' }) })
    .last()
  await row.getByRole('button', { name: 'Δήλωσε το' }).click()

  const modal = page.getByRole('heading', { name: 'Ολοκλήρωση εργασίας' })
  await expect(modal).toBeVisible()

  // The quoted price is pre-filled; the garage overrides it with what it took.
  const amount = page.getByPlaceholder('0.00')
  await amount.fill('248')

  // The net/VAT split is shown live — that is the number commission uses.
  // Exact matching: '48.00€' is a substring of the '248.00€' total.
  await expect(page.getByText('200.00€', { exact: true })).toBeVisible()
  await expect(page.getByText('48.00€', { exact: true })).toBeVisible()
  await expect(page.getByText('248.00€', { exact: true })).toBeVisible()

  // Rate the client too.
  await page.getByRole('radio', { name: '5 αστέρια' }).click()
  await page.getByRole('button', { name: 'Ήρθε στην ώρα του' }).click()

  const completeResponse = page.waitForResponse((r) => r.url().includes('/complete/'))
  await page.getByRole('button', { name: 'Καταχώρηση' }).click()
  const completed = await completeResponse
  if (!completed.ok()) {
    throw new Error(`complete failed: ${completed.status()} ${await completed.text()}`)
  }
  await expect(modal).toBeHidden({ timeout: 15_000 })

  // This job leaves the "awaiting" list; others may legitimately remain.
  await expect(awaiting.getByText(model)).toBeHidden({ timeout: 15_000 })

  // The UI must have closed *this* job, not another row that happened to be
  // in the list.
  const state = await request.get(`/api/requests/${requestId}/`, {
    headers: { Cookie: `auth-token=${clientToken}` },
  })
  const stateBody = await state.json()
  expect((stateBody.request ?? stateBody).status).toBe('completed')

  // ── Client: review the garage ───────────────────────────────────────────
  await context.clearCookies()
  await loginAsClient(page, request, email, PASSWORD)
  await page.goto(`/requests/${clientId}/details/${requestId}/`)

  await expect(page.getByRole('heading', { name: 'Ολοκληρώθηκε' })).toBeVisible({ timeout: 20_000 })
  // The declared total is surfaced to the client, not just the quote.
  await expect(page.getByText(/248[.,]00€/).first()).toBeVisible()

  const reviewCard = page.getByRole('heading', { name: 'Αξιολόγηση' })
  await expect(reviewCard).toBeVisible()

  await page.getByRole('radio', { name: '4 αστέρια' }).click()
  await page.getByRole('button', { name: 'Καθαρή δουλειά' }).click()
  await page.getByPlaceholder('Γράψε λίγα λόγια (προαιρετικά)').fill('Γρήγοροι και καθαροί.')
  await page.getByRole('button', { name: 'Υποβολή' }).click()

  // Both sides have now written, so the garage's review is revealed.
  await expect(page.getByText('Η αξιολόγησή σου')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Η αξιολόγηση από το συνεργείο')).toBeVisible({ timeout: 15_000 })
})
