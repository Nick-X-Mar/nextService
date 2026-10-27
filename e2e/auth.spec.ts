import { test, expect } from '@playwright/test'
import { loginViaAPI, TEST_GARAGE } from './helpers'
import { adminPost, adminSession, api, createClientWithRequest, emailLogsFor, getRow, makeLegacyGuest, registerPendingGarage } from './a-helpers'
import { clientEmailLogs, publishedSiteOrigin } from './r-helpers'

test.describe('Authentication flows', () => {

  test('Client registration with missing fields fails', async ({ request }) => {
    const resp = await request.post('/api/auth/register', {
      data: { email: '', password: '', acceptedTerms: false },
    })
    expect(resp.status()).toBe(400)
  })

  test('Client registration with short password fails', async ({ request }) => {
    const resp = await request.post('/api/auth/register', {
      data: { email: 'short@test.com', password: '12345', acceptedTerms: true },
    })
    expect(resp.status()).toBe(400)
  })

  test('Client registration without terms fails', async ({ request }) => {
    const resp = await request.post('/api/auth/register', {
      data: { email: 'noterms@test.com', password: '123456', acceptedTerms: false },
    })
    expect(resp.status()).toBe(400)
  })

  test('Client login with wrong password fails', async ({ request }) => {
    const { status, data } = await loginViaAPI(request, 'nonexistent@test.com', 'wrongpass', 'client')
    expect(status).toBe(401)
    expect(data.success).toBeFalsy()
  })

  test('Garage login works', async ({ request }) => {
    const { status, data, token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.companyName).toBeTruthy()
    expect(token).toBeTruthy()
  })

  test('Auth cookie grants access to protected routes', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
  })

  test('No cookie returns 401 on protected routes', async ({ request }) => {
    const resp = await request.get(`/api/garage/available-requests?garageId=${TEST_GARAGE.id}`)
    expect(resp.status()).toBe(401)
  })

  test('GET /api/auth/me returns user info with valid cookie', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.get('/api/auth/me', {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.authenticated).toBe(true)
    expect(data.userType).toBe('garage')
  })

  test('Logout clears auth cookie', async ({ request }) => {
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.post('/api/auth/logout', {
      headers: { Cookie: `auth-token=${token}` },
    })
    expect(resp.status()).toBe(200)
    const setCookie = resp.headers()['set-cookie'] || ''
    expect(setCookie).toContain('auth-token=;')
  })
})

test.describe.serial('Pending garages', () => {
  let garage: Awaited<ReturnType<typeof registerPendingGarage>>
  let requestId: string

  test('Setup: a pending garage and an open request', async () => {
    garage = await registerPendingGarage('pending')
    const client = await createClientWithRequest(`e2e-auth-pending-${Date.now()}@test.com`, 'TestPass123')
    requestId = client.requestId
    expect((await getRow('Garages', garage.garageId))?.isActive).toBe(false)
  })

  test('A pending garage can save its profile and stays pending', async () => {
    const res = await api(`/api/garage/${garage.garageId}/`, {
      method: 'PUT',
      cookie: garage.token,
      body: {
        companyName: `${garage.profile.companyName} (νέο)`,
        email: garage.profile.email,
        mobile: garage.profile.mobile,
        address: garage.profile.address,
        tin: garage.profile.tin,
        taxAuthority: garage.profile.taxAuthority,
        description: 'Περιγραφή',
      },
    })
    expect(res.status).toBe(200)
    expect((res.data.garage as { isActive: boolean }).isActive).toBe(false)

    const row = await getRow('Garages', garage.garageId)
    expect(row?.isActive).toBe(false)
    expect(row?.companyName).toBe(`${garage.profile.companyName} (νέο)`)

    // The activation mail belongs to the admin approval alone.
    await new Promise((r) => setTimeout(r, 1000))
    expect(await emailLogsFor(garage.garageId, 'garage_activated')).toHaveLength(0)
  })

  test("A pending garage cannot read a client's request", async () => {
    const res = await api(`/api/requests/${requestId}/`, { cookie: garage.token })
    expect(res.status).toBe(403)
    expect(res.data.code).toBe('GARAGE_INACTIVE')
  })

  test('A profile save cannot take another garage’s email', async () => {
    const other = await registerPendingGarage('other')
    const res = await api(`/api/garage/${garage.garageId}/`, {
      method: 'PUT',
      cookie: garage.token,
      body: {
        companyName: garage.profile.companyName,
        email: other.profile.email.toUpperCase(),
        mobile: garage.profile.mobile,
        address: garage.profile.address,
        tin: garage.profile.tin,
        taxAuthority: garage.profile.taxAuthority,
      },
    })
    expect(res.status).toBe(409)
    expect((await getRow('Garages', garage.garageId))?.email).toBe(garage.profile.email)
  })

  test('Admin approval activates the garage once; a deactivation bites at once', async () => {
    const admin = await adminSession()

    // Pending: shut out of the marketplace.
    const before = await api('/api/garage/available-requests/', { cookie: garage.token })
    expect(before.status).toBe(403)
    expect(before.data.code).toBe('GARAGE_INACTIVE')

    expect(await adminPost(`/api/admin/users/garages/${garage.garageId}/activate/`, admin)).toBe(200)
    const after = await api('/api/garage/available-requests/', { cookie: garage.token })
    expect(after.status).toBe(200)
    await new Promise((r) => setTimeout(r, 1000))
    expect(await emailLogsFor(garage.garageId, 'garage_activated')).toHaveLength(1)

    // Approving again must not mail the garage a second time.
    expect(await adminPost(`/api/admin/users/garages/${garage.garageId}/activate/`, admin)).toBe(200)

    // The feed was just read as active, so the flag is cached — the
    // deactivation has to clear it rather than wait the cache out.
    expect(await adminPost(`/api/admin/users/garages/${garage.garageId}/deactivate/`, admin)).toBe(200)
    const cut = await api('/api/garage/available-requests/', { cookie: garage.token })
    expect(cut.status).toBe(403)
    expect(cut.data.code).toBe('GARAGE_INACTIVE')
    const detail = await api(`/api/requests/${requestId}/`, { cookie: garage.token })
    expect(detail.status).toBe(403)

    // A deactivated garage saving its profile stays deactivated.
    const save = await api(`/api/garage/${garage.garageId}/`, {
      method: 'PUT',
      cookie: garage.token,
      body: {
        companyName: garage.profile.companyName,
        email: garage.profile.email,
        mobile: garage.profile.mobile,
        address: garage.profile.address,
        tin: garage.profile.tin,
        taxAuthority: garage.profile.taxAuthority,
      },
    })
    expect(save.status).toBe(200)
    expect((await getRow('Garages', garage.garageId))?.isActive).toBe(false)
    expect(await emailLogsFor(garage.garageId, 'garage_activated')).toHaveLength(1)

    // Unknown ids are refused instead of minting a bare garage row.
    expect(await adminPost('/api/admin/users/garages/garage-does-not-exist/deactivate/', admin)).toBe(404)
    expect(await getRow('Garages', 'garage-does-not-exist')).toBeUndefined()
  })
})

/**
 * Links in the mails that carry a credential. They were built from
 * NEXT_PUBLIC_APP_URL — never provisioned by CDK — falling back to
 * http://localhost:3000, so in AWS the reset and merge links led nowhere.
 * They now come from SITE_URL, the same origin the site publishes as its
 * canonical host; EmailLogs records the origin each mail pointed at (never the
 * URL — it carries the token).
 */
test.describe('Emailed links', () => {
  const stamp = Date.now()

  const logFor = async (clientId: string, template: string) => {
    let rows: Record<string, unknown>[] = []
    await expect.poll(async () => (rows = await clientEmailLogs(clientId, template)).length, { timeout: 10_000 }).toBe(1)
    return rows[0]
  }

  test("The password-reset mail links to SITE_URL's origin", async () => {
    const site = await publishedSiteOrigin()
    const user = await createClientWithRequest(`e2e-link-reset-${stamp}@test.com`, 'TestPass123')
    const res = await api('/api/auth/forgot-password/', {
      method: 'POST',
      body: { email: `e2e-link-reset-${stamp}@test.com`, userType: 'client' },
    })
    expect(res.status).toBe(200)
    const row = await logFor(user.clientId, 'password_reset')
    expect(row.linkOrigin).toBe(site)
    expect(JSON.stringify(row)).not.toContain('reset-password/')
  })

  test("The account-merge mail links to SITE_URL's origin", async () => {
    const site = await publishedSiteOrigin()
    const owner = await createClientWithRequest(`e2e-link-merge-owner-${stamp}@test.com`, 'TestPass123')
    const guest = await createClientWithRequest(`e2e-link-merge-guest-${stamp}@test.com`, 'TestPass123')
    await makeLegacyGuest(guest.clientId)
    const res = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: `e2e-link-merge-owner-${stamp}@test.com` },
    })
    expect(res.status).toBe(200)
    const row = await logFor(owner.clientId, 'account_merge_confirmation')
    expect(row.linkOrigin).toBe(site)
  })
})

/**
 * The sliding session re-issues the cookie only once it is an hour old. It
 * used to ride on every authenticated response, and a stale one landing after
 * a newer cookie (a guest merge, a sign-in elsewhere in the browser) put the
 * old session back.
 */
test('A fresh session is not re-issued on every request', async () => {
  const user = await createClientWithRequest(`e2e-sliding-${Date.now()}@test.com`, 'TestPass123')
  const apiCall = await api(`/api/clients/${user.clientId}/`, { cookie: user.token })
  expect(apiCall.status).toBe(200)
  expect(apiCall.authToken).toBeNull()
  const pageView = await api(`/requests/${user.clientId}/`, { cookie: user.token })
  expect(pageView.status).toBe(200)
  expect(pageView.authToken).toBeNull()
})

test("Registering without a name never turns the email into the first name", async () => {
  // Garages see a client's first name before winning the job; this used to
  // be the address's local part whenever the name field was left empty.
  const address = `e2e-noname-${Date.now()}@test.com`
  const res = await api('/api/auth/register/', {
    method: 'POST',
    body: { email: address, password: 'TestPass123', acceptedTerms: true },
  })
  expect(res.status).toBe(200)
  const client = res.data.client as { id: string; firstName: string }
  expect(client.firstName).toBe('Επισκέπτης')
  expect((await getRow('Clients', client.id))?.firstName).not.toBe(address.split('@')[0])
})

