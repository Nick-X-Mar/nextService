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
