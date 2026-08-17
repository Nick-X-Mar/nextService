import { test, expect } from '@playwright/test'
import { loginViaAPI, TEST_GARAGE } from './helpers'

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
