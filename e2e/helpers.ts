import { type Page, type APIRequestContext } from '@playwright/test'

export const TEST_CLIENT = {
  email: `e2e-client-${Date.now()}@test.com`,
  password: 'TestPass123',
}

export const TEST_GARAGE = {
  email: 'garage@gmail.com',
  password: '123456',
  id: 'garage-1775160423646-8n0w0cltj',
}

/** Register a new client via API and return the client data */
export async function registerClient(request: APIRequestContext, email: string, password: string) {
  const resp = await request.post('/api/auth/register', {
    data: { email, password, acceptedTerms: true },
  })
  const data = await resp.json()

  // If rate limited, try to login instead (client may already exist from prior run)
  if (resp.status() === 429 || resp.status() === 409) {
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password, userType: 'client' },
    })
    const loginData = await loginResp.json()
    if (loginData.success) {
      return { success: true, client: loginData.user }
    }
  }

  return data
}

/** Login via API and return the auth cookie value */
export async function loginViaAPI(
  request: APIRequestContext,
  email: string,
  password: string,
  userType: 'client' | 'garage'
) {
  const resp = await request.post('/api/auth/login', {
    data: { email, password, userType },
  })
  const setCookie = resp.headers()['set-cookie'] || ''
  const match = setCookie.match(/auth-token=([^;]+)/)
  return {
    data: await resp.json(),
    token: match ? match[1] : '',
    status: resp.status(),
  }
}

/** Set auth cookie on a page's browser context */
export async function setAuthCookie(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: 'auth-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** Login as garage and set up browser context */
export async function loginAsGarage(page: Page, request: APIRequestContext) {
  const { token, data } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
  await setAuthCookie(page, token)
  // Navigate first so localStorage is accessible
  await page.goto('/')
  await page.evaluate((garageData: Record<string, unknown>) => {
    localStorage.setItem('garageUser', JSON.stringify(garageData))
    localStorage.setItem('userType', 'garage')
  }, data.user as Record<string, unknown>)
  return { token, user: data.user }
}

/** Login as client and set up browser context */
export async function loginAsClient(page: Page, request: APIRequestContext, email: string, password: string) {
  const { token, data } = await loginViaAPI(request, email, password, 'client')
  await setAuthCookie(page, token)
  // Navigate first so localStorage is accessible
  await page.goto('/')
  const user = data.client || data.user
  await page.evaluate((clientData: Record<string, unknown>) => {
    localStorage.setItem('clientUser', JSON.stringify(clientData))
    localStorage.setItem('userType', 'client')
  }, user as Record<string, unknown>)
  return { token, client: user }
}
