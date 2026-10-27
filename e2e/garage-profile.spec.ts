import { test, expect } from '@playwright/test'
import { loginViaAPI, setAuthCookie, TEST_GARAGE } from './helpers'
import { registerPendingGarage } from './c-helpers'

test.describe('Garage profile', () => {

  test('Public garage profile is accessible without auth', async ({ request }) => {
    const resp = await request.get(`/api/garage/${TEST_GARAGE.id}`)
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.companyName || data.garage?.companyName).toBeTruthy()
  })

  test('Garage profile update requires auth', async ({ request }) => {
    // Without the middleware fix, PUT garage profile doesn't go through the public route
    // because it only allows GET. So this should return 401.
    const resp = await request.put(`/api/garage/${TEST_GARAGE.id}`, {
      data: { description: 'test' },
    })
    expect(resp.status()).toBe(401)
  })

  test('Garage profile update with auth does not return 401', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')

    const resp = await request.put(`/api/garage/${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { description: 'E2E updated description' },
    })
    // Should authenticate (not 401) — may return 400 for missing required fields, that's ok
    expect(resp.status()).not.toBe(401)
  })
})

/**
 * The workday start time is what turns "Δευτέρα 15/09" into "Δευτέρα 15/09, από τις
 * 09:00" on the client's offer card, so it has to survive the round trip through the
 * profile endpoint — including for a reader who is not the garage.
 */
test.describe.serial('Garage workday start time', () => {
  test('Saved on the profile and returned to everyone', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const current = await (await request.get(`/api/garage/${TEST_GARAGE.id}`)).json()
    const garage = current.garage

    const resp = await request.put(`/api/garage/${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { ...garage, workdayStartTime: '08:30' },
    })
    expect(resp.status()).toBe(200)
    expect((await resp.json()).garage.workdayStartTime).toBe('08:30')

    // The client reads it off the public profile when rendering an offer.
    const publicResp = await request.get(`/api/garage/${TEST_GARAGE.id}`)
    expect((await publicResp.json()).garage.workdayStartTime).toBe('08:30')

    // Put it back so the fixture garage is left as it was found.
    await request.put(`/api/garage/${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { ...garage, workdayStartTime: garage.workdayStartTime || '' },
    })
  })
})

/**
 * The badges the garage sees on Αιτήματα / Προσφορές come off one summary call — the
 * same one the header bell and the banner stack read.
 */
test.describe('Garage notification summary', () => {
  test('Carries the two garage counters', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get('/api/notifications/summary', {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(typeof data.availableRequests).toBe('number')
    expect(typeof data.offersNeedingAttention).toBe('number')
    expect(data.availableRequests).toBeGreaterThanOrEqual(0)
  })
})

/**
 * A garage an admin has not approved still holds a garage session — it needs
 * one to see where its application stands — but the marketplace is closed to
 * it: the feed carries client names and phone numbers. Its own profile stays
 * open, because filling it in is the one useful thing to do while waiting.
 */
test.describe.serial('Pending garage', () => {
  let pending: { id: string; email: string; token: string }

  test('Setup: register a garage (pending approval)', async ({ request }) => {
    pending = await registerPendingGarage(request)
  })

  test('The feed, offers and offer creation answer 403 GARAGE_INACTIVE', async ({ request }) => {
    const headers = { Cookie: `auth-token=${pending.token}` }
    for (const resp of [
      await request.get(`/api/garage/available-requests?garageId=${pending.id}`, { headers }),
      await request.get(`/api/garage/available-requests?garageId=${pending.id}&countOnly=1`, { headers }),
      await request.get(`/api/garage/offers?garageId=${pending.id}`, { headers }),
      await request.get(`/api/offers?garageId=${pending.id}`, { headers }),
      await request.post('/api/offers', { headers, data: { serviceRequestId: 'sr-any', offerAmount: 100 } }),
    ]) {
      expect(resp.status(), resp.url()).toBe(403)
      expect((await resp.json()).code, resp.url()).toBe('GARAGE_INACTIVE')
    }
  })

  test('The dashboard shows the review screen and keeps the profile reachable', async ({ page }) => {
    await setAuthCookie(page, pending.token)
    await page.goto(`/garage-dashboard/${pending.id}/`)
    await expect(page.getByRole('heading', { name: 'Η αίτησή σας εξετάζεται' })).toBeVisible({ timeout: 45_000 })

    await page.getByRole('button', { name: 'Στοιχεία συνεργείου' }).click()
    await expect(page).toHaveURL(/\?tab=settings/)
    await expect(page.getByRole('heading', { name: 'Προφίλ Συνεργείου' })).toBeVisible({ timeout: 20_000 })
  })

  test('A session cached as active still lands on the review screen, not on empty lists', async ({ page }) => {
    await setAuthCookie(page, pending.token)
    // The state an open tab is in when an admin deactivates the garage: the
    // session the browser holds still says "active".
    let first = true
    await page.route((url) => url.pathname.startsWith('/api/auth/me'), async (route) => {
      if (!first) return route.continue()
      first = false
      const real = await route.fetch()
      const body = await real.json()
      await route.fulfill({ response: real, json: { ...body, user: { ...body.user, isActive: true } } })
    })
    await page.goto(`/garage-dashboard/${pending.id}/`)
    await expect(page.getByRole('heading', { name: 'Η αίτησή σας εξετάζεται' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'Νέα Αιτήματα' })).toHaveCount(0)
  })

  // Last on purpose: until the profile route stops writing `isActive` itself,
  // this save is what would approve the garage for every test after it.
  test('It can still save its own profile — and saving does not approve it', async ({ request }) => {
    // Read as the owner: the public profile GET leaves out the login email,
    // ΑΦΜ and ΔΟΥ, and the PUT below needs them back.
    const asOwner = { headers: { Cookie: `auth-token=${pending.token}` } }
    const current = (await (await request.get(`/api/garage/${pending.id}`, asOwner)).json()).garage
    const resp = await request.put(`/api/garage/${pending.id}`, {
      ...asOwner,
      data: { ...current, isActive: true, description: 'Συνεργείο σε αναμονή έγκρισης', workdayStartTime: '08:00' },
    })
    expect(resp.status()).toBe(200)

    const after = (await (await request.get(`/api/garage/${pending.id}`, asOwner)).json()).garage
    expect(after.workdayStartTime).toBe('08:00')
    // Only an admin approves a garage. A profile save that flips this lets any
    // newly registered garage into the marketplace by pressing "Αποθήκευση".
    expect(after.isActive).toBe(false)
  })
})
