import { test, expect, type Page } from '@playwright/test'

/**
 * Google Analytics runs only on the real host and only after the visitor accepts.
 * The page is served from the local app under the real hostname, so the code's
 * host check and the CSP are the ones production gets, with no test switch in
 * the app. Google's script is answered here: only requests that got past the CSP
 * ever reach this route.
 */

const SITE = 'https://www.nextservice.gr'

async function openAsProduction(page: Page, path = '/') {
  const google: string[] = []
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url())
    // The dev server's long-lived connections (hot reload) have no place here.
    if (url.pathname.startsWith('/_next/webpack-hmr')) return route.abort()
    const response = await route.fetch({ url: `http://localhost:3000${url.pathname}${url.search}` }).catch(() => null)
    if (response) await route.fulfill({ response })
    else await route.abort().catch(() => {})
  })
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
    google.push(route.request().url())
    return route.fulfill({ contentType: 'text/javascript', body: '' })
  })
  await page.goto(`${SITE}${path}`)
  return google
}

const question = (page: Page) => page.getByRole('dialog', { name: 'Cookies στατιστικών' })

test.describe('Google Analytics consent', () => {
  test('Nothing of Google\'s loads until the visitor accepts, and a yes is remembered', async ({ page }) => {
    const google = await openAsProduction(page)
    await expect(question(page)).toBeVisible({ timeout: 30_000 })
    expect(google).toEqual([])

    await question(page).getByRole('button', { name: 'Αποδοχή' }).click()
    await expect(question(page)).toBeHidden()
    await expect.poll(() => google.length).toBe(1)
    expect(google[0]).toContain('id=G-K9TH5KKQVB')

    await page.reload()
    await expect.poll(() => google.length, { timeout: 30_000 }).toBe(2)
    await expect(question(page)).toBeHidden()
  })

  test('A no loads nothing and is not asked again', async ({ page }) => {
    const google = await openAsProduction(page)
    await question(page).getByRole('button', { name: 'Όχι, ευχαριστώ' }).click({ timeout: 30_000 })
    await expect(question(page)).toBeHidden()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Ρυθμίσεις cookies' })).toBeVisible({ timeout: 30_000 })
    await expect(question(page)).toBeHidden()
    expect(google).toEqual([])
  })

  test('The footer withdraws consent and clears the cookies', async ({ page }) => {
    const google = await openAsProduction(page, '/about/')
    await question(page).getByRole('button', { name: 'Αποδοχή' }).click({ timeout: 30_000 })
    await expect.poll(() => google.length).toBe(1)
    await page.evaluate(() => { document.cookie = '_ga=GA1.1.1.1; path=/; domain=.nextservice.gr' })

    await page.getByRole('button', { name: 'Ρυθμίσεις cookies' }).click()
    await question(page).getByRole('button', { name: 'Όχι, ευχαριστώ' }).click()
    await page.waitForLoadState('load')
    await expect(question(page)).toBeHidden()
    expect((await page.context().cookies()).map((c) => c.name)).not.toContain('_ga')
    await page.waitForTimeout(500)
    expect(google).toHaveLength(1)
  })

  test('The admin panel is neither asked nor measured', async ({ page }) => {
    const google = await openAsProduction(page, '/admin/login/')
    await expect(page.locator('input').first()).toBeVisible({ timeout: 30_000 })
    await expect(question(page)).toBeHidden()
    expect(google).toEqual([])
  })

  test('On any other host there is no question and no footer link', async ({ page }) => {
    await page.goto('/about/')
    await expect(page.locator('footer')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)
    await expect(question(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ρυθμίσεις cookies' })).toHaveCount(0)
  })
})
