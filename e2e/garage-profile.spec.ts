import { test, expect } from '@playwright/test'
import { loginViaAPI, setAuthCookie, TEST_GARAGE } from './helpers'
import { registerPendingGarage } from './c-helpers'
import { getRow } from './a-helpers'
import { TABLES } from '../src/lib/tables'

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

test('Registration asks for the area and the municipality, and the profile keeps them', async ({ request }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const base = {
    companyName: `E2E Δήμος ${stamp}`,
    contactFirstName: 'Νίκος',
    contactLastName: 'Δοκιμή',
    tin: stamp.slice(-9),
    email: `e2e-garage-area-${stamp}@test.com`,
    password: 'TestPass123',
    taxAuthority: 'ΔΟΥ Αθηνών',
    address: 'Πατησίων 1, Αθήνα',
    mobile: `69${stamp.slice(-8)}`,
    businessTypes: ['mechanic'],
    acceptedTerms: true,
  }
  expect((await request.post('/api/auth/register-professional/', { data: { ...base, area: 'Κυψέλη' } })).status()).toBe(400)
  expect((await request.post('/api/auth/register-professional/', { data: { ...base, municipality: 'Δήμος Αθηναίων' } })).status()).toBe(400)

  const ok = await request.post('/api/auth/register-professional/', {
    data: { ...base, area: ' Κυψέλη ', municipality: 'Δήμος Αθηναίων' },
  })
  expect(ok.status()).toBe(200)
  const id = (await ok.json()).garage.id as string
  const row = await getRow(TABLES.Garages, id)
  expect(row?.area).toBe('Κυψέλη')
  expect(row?.municipality).toBe('Δήμος Αθηναίων')

  // The public profile carries the municipality the client's offer card shows.
  const pub = await (await request.get(`/api/garage/${id}/`)).json()
  expect(pub.garage.municipality).toBe('Δήμος Αθηναίων')
})

/**
 * Συνεργείο, φανοποιείο, βουλκανιζατέρ — as many as apply. Required to register;
 * a garage registered before it existed keeps saving its profile without it.
 */
test.describe.serial('Garage business type', () => {
  let pending: { id: string; token: string }

  test('Registration refuses no type, and keeps only the known ones', async ({ request }) => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    const base = {
      companyName: `E2E Τύπος ${stamp}`,
      contactFirstName: 'Νίκος',
      contactLastName: 'Δοκιμή',
      tin: stamp.slice(-9),
      email: `e2e-garage-type-${stamp}@test.com`,
      password: 'TestPass123',
      taxAuthority: 'ΔΟΥ Αθηνών',
      address: 'Πατησίων 1, Αθήνα',
      area: 'Κυψέλη',
      municipality: 'Δήμος Αθηναίων',
      mobile: `69${stamp.slice(-8)}`,
      acceptedTerms: true,
    }
    for (const businessTypes of [undefined, [], ['garage-door']]) {
      const refused = await request.post('/api/auth/register-professional/', { data: { ...base, businessTypes } })
      expect(refused.status(), JSON.stringify(businessTypes)).toBe(400)
    }

    const ok = await request.post('/api/auth/register-professional/', {
      data: { ...base, businessTypes: ['tyres', 'bodywork', 'tyres', 'garage-door'] },
    })
    expect(ok.status()).toBe(200)
    const id = (await ok.json()).garage.id as string
    const token = (ok.headers()['set-cookie'] || '').match(/auth-token=([^;]+)/)![1]
    pending = { id, token }
    expect((await getRow(TABLES.Garages, id))?.businessTypes).toEqual(['bodywork', 'tyres'])
    expect((await (await request.get(`/api/garage/${id}/`)).json()).garage.businessTypes).toEqual(['bodywork', 'tyres'])
  })

  test('The profile changes it, and a save without it leaves it as it was', async ({ request }) => {
    const asOwner = { headers: { Cookie: `auth-token=${pending.token}` } }
    const current = (await (await request.get(`/api/garage/${pending.id}/`, asOwner)).json()).garage

    const changed = await request.put(`/api/garage/${pending.id}/`, { ...asOwner, data: { ...current, businessTypes: ['mechanic'] } })
    expect(changed.status()).toBe(200)
    expect((await changed.json()).garage.businessTypes).toEqual(['mechanic'])

    const without = await request.put(`/api/garage/${pending.id}/`, { ...asOwner, data: { ...current, businessTypes: [] } })
    expect(without.status()).toBe(200)
    expect((await getRow(TABLES.Garages, pending.id))?.businessTypes).toEqual(['mechanic'])
  })

  test('Picked on the profile page and saved', async ({ page }) => {
    await setAuthCookie(page, pending.token)
    await page.goto(`/garage-dashboard/${pending.id}/?tab=settings`)
    const group = page.getByRole('group', { name: 'Τύπος επιχείρησης' })
    await expect(group.getByRole('button', { name: 'Συνεργείο' })).toHaveAttribute('aria-pressed', 'true', { timeout: 45_000 })

    // None left: the save is refused on the page.
    await group.getByRole('button', { name: 'Συνεργείο' }).click()
    await page.getByRole('button', { name: 'Αποθήκευση' }).click()
    await expect(page.getByText('Επιλέξτε αν είστε συνεργείο, φανοποιείο ή βουλκανιζατέρ').first()).toBeVisible()

    await group.getByRole('button', { name: 'Φανοποιείο' }).click()
    await group.getByRole('button', { name: 'Βουλκανιζατέρ' }).click()
    await page.getByRole('button', { name: 'Αποθήκευση' }).click()
    await expect(page.getByText('Τα στοιχεία του συνεργείου ενημερώθηκαν.')).toBeVisible()
    expect((await getRow(TABLES.Garages, pending.id))?.businessTypes).toEqual(['bodywork', 'tyres'])
  })
})

test('The registration form asks what kind of shop it is', async ({ page }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  await page.goto('/register-professional/')
  const fill = (placeholder: string, value: string) => page.getByPlaceholder(placeholder, { exact: true }).fill(value)
  await fill('π.χ. ΑΕ Συνεργείο Αυτοκινήτων Παπαδόπουλος', `E2E Φόρμα ${stamp}`)
  await fill('π.χ. Γιώργος', 'Νίκος')
  await fill('π.χ. Παπαδόπουλος', 'Δοκιμή')
  await fill('π.χ. 123456789', stamp.slice(-9))
  await fill('π.χ. info@company.gr', `e2e-garage-form-${stamp}@test.com`)
  await fill('π.χ. ΔΟΥ Αθηνών', 'ΔΟΥ Αθηνών')
  await fill('π.χ. Λεωφόρος Πατησιών 123, Αθήνα', 'Πατησίων 1, Αθήνα')
  await fill('π.χ. Κυψέλη', 'Κυψέλη')
  await fill('π.χ. Δήμος Αθηναίων', 'Δήμος Αθηναίων')
  await fill('π.χ. 6971234567 ή +30 6971234567', `69${stamp.slice(-8)}`)
  await page.locator('input[type="password"]').nth(0).fill('TestPass123')
  await page.locator('input[type="password"]').nth(1).fill('TestPass123')
  await page.getByRole('checkbox').check()

  // Nothing picked: the form says so and sends nothing.
  await page.getByRole('button', { name: 'Εγγραφή Εταιρείας' }).click()
  await expect(page.getByText('Επιλέξτε αν είστε συνεργείο, φανοποιείο ή βουλκανιζατέρ').first()).toBeVisible()

  const registered = page.waitForResponse((r) => r.url().includes('/api/auth/register-professional') && r.request().method() === 'POST')
  await page.getByRole('group', { name: 'Τύπος επιχείρησης' }).getByRole('button', { name: 'Φανοποιείο' }).click()
  await page.getByRole('button', { name: 'Εγγραφή Εταιρείας' }).click()
  const response = await registered
  expect(response.status()).toBe(200)
  const id = (await response.json()).garage.id as string
  expect((await getRow(TABLES.Garages, id))?.businessTypes).toEqual(['bodywork'])
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
