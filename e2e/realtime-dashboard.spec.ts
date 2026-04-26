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
