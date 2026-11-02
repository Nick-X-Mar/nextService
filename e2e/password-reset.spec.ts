import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, TEST_GARAGE } from './helpers'
import { getGarage } from './dynamo-helpers'

const CLIENT_EMAIL = `e2e-pwd-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'
const NEW_PASSWORD = 'NewPass456'

test.describe.serial('Password Reset flow', () => {

  test('Setup: register client', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    expect(reg.client).toBeTruthy()
  })

  test('Forgot password returns success for existing email', async ({ request }) => {
    const resp = await request.post('/api/auth/forgot-password', {
      data: { email: CLIENT_EMAIL, userType: 'client' },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
  })

  test('Forgot password returns success for non-existing email (no enumeration)', async ({ request }) => {
    const resp = await request.post('/api/auth/forgot-password', {
      data: { email: 'doesnotexist@example.com', userType: 'client' },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    // Should still return success to prevent account enumeration
    expect(data.success).toBe(true)
  })

  test('A garage email sent with the default Πελάτης type still gets its reset link', async ({ request }) => {
    const before = await getGarage(TEST_GARAGE.id)
    const resp = await request.post('/api/auth/forgot-password', {
      data: { email: TEST_GARAGE.email, userType: 'client' },
    })
    expect(resp.status()).toBe(200)
    const after = await getGarage(TEST_GARAGE.id)
    expect(after?.passwordResetTokenHash).toBeTruthy()
    expect(after?.passwordResetTokenHash).not.toBe(before?.passwordResetTokenHash)
  })

  test('Reset password with invalid token fails', async ({ request }) => {
    const resp = await request.post('/api/auth/reset-password', {
      data: {
        token: 'invalid-token-that-does-not-exist',
        userType: 'client',
        newPassword: NEW_PASSWORD,
      },
    })
    // Should fail
    expect(resp.status()).toBeGreaterThanOrEqual(400)
    const data = await resp.json()
    expect(data.success).toBeFalsy()
  })

  test('Reset password with short password fails', async ({ request }) => {
    const resp = await request.post('/api/auth/reset-password', {
      data: {
        token: 'some-token',
        userType: 'client',
        newPassword: '123',
      },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('Original password still works (no reset happened)', async ({ request }) => {
    const { status, data } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })
})
