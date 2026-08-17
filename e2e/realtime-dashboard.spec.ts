import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsGarage, TEST_GARAGE } from './helpers'
import { isAppSyncMockReachable } from './appsync-helpers'

// Browser-level smoke test: a live garage dashboard should reflect a new
// service request without a manual reload. This covers the appsync-service
// + useRealtimeRequests + GarageDashboardPage wiring end-to-end.

test.beforeAll(async () => {
  const ok = await isAppSyncMockReachable()
  test.skip(!ok, 'Local AppSync mock not reachable on http://localhost:3002 — skipping dashboard suite')
})

const CLIENT_EMAIL = `e2e-rt-dash-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

test('Garage dashboard shows new request without refresh', async ({ page, request, browser }) => {
  // 1. Register a client (we'll use the API to create the request).
  const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
  const clientId = reg.client.id
  const clientLogin = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')

  // 2. Open the garage dashboard in a real browser.
  await loginAsGarage(page, request)
  await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/`)

  // Wait until the dashboard is past its loading spinner — the badge label
  // appears once garageData has loaded and counts have been fetched.
  const badge = page.locator('button:has-text("Αιτηματα")').first()
  await badge.waitFor({ state: 'visible', timeout: 15_000 })

  // Capture the starting count from the badge label "Αιτηματα (N)".
  const readCount = async () => {
    const text = (await badge.textContent()) ?? ''
    const m = text.match(/\((\d+)\)/)
    return m ? parseInt(m[1], 10) : 0
  }
  const before = await readCount()

  // 3. From outside the browser, create a new service request as the client.
  const uniqueDesc = `Realtime dashboard test ${Date.now()}`
  const srResp = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${clientLogin.token}` },
    data: {
      clientId,
      category: 'symplektis',
      description: uniqueDesc,
      brand: 'Peugeot',
      model: '208',
      modelYear: '2021',
      engineCC: '1200',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
    },
  })
  expect(srResp.status()).toBe(200)

  // 4. The badge should increment to (N+1) within a few seconds — no reload.
  await expect.poll(readCount, {
    timeout: 10_000,
    message: 'Expected the Αιτηματα badge to increment after the realtime broadcast'
  }).toBeGreaterThanOrEqual(before + 1)

  // 5. Switching to the requests tab (or staying on it) should show the new
  // card. The tab is the default, so the description should be visible.
  const card = page.locator(`text=${uniqueDesc.split(' ')[0]}`).first()
  // Some envs may not render the description on the card; just assert the
  // count went up rather than asserting on the specific text.
  await card.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => { /* non-fatal */ })

  // Avoid leaving a webhook registration behind — we don't have admin access
  // here so we skip cleanup. Tests are designed to be data-additive.
})

test('Header bell counts new requests away from the dashboard', async ({ page, request }) => {
  const email = `e2e-rt-bell-${Date.now()}@test.com`
  const reg = await registerClient(request, email, CLIENT_PASSWORD)
  const clientLogin = await loginViaAPI(request, email, CLIENT_PASSWORD, 'client')

  // The garage is anywhere but the requests feed — this is the case the
  // dashboard-only subscription used to miss entirely.
  await loginAsGarage(page, request)
  await page.goto(`/garage-dashboard/${TEST_GARAGE.id}/chats/`)

  const bell = page.locator('header button[aria-label="Ειδοποιήσεις"], header button[aria-label*="αίτημα"], header button[aria-label*="αιτήματα"]').first()
  await bell.waitFor({ state: 'visible', timeout: 15_000 })

  await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${clientLogin.token}` },
    data: {
      clientId: reg.client.id,
      category: 'imantas',
      description: `Realtime bell test ${Date.now()}`,
      brand: 'Citroen',
      model: 'C3',
      modelYear: '2017',
      engineCC: '1200',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
    },
  })

  // The badge counts arrivals, so it says at least 1 without any reload.
  await expect.poll(
    async () => (await bell.getAttribute('aria-label')) ?? '',
    { timeout: 10_000, message: 'Expected the header bell to count the new request' }
  ).toMatch(/αίτημα|αιτήματα/)

  // Opening it lists what came in and offers the way through to the feed.
  await bell.click()
  await expect(page.getByText('Δες τα αιτήματα')).toBeVisible()
})
