import { test, expect } from '@playwright/test'
import { loginViaAPI, TEST_GARAGE } from './helpers'

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
