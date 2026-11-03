import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, setAuthCookie } from './helpers'

/**
 * Browser-level checks for the public pages: the one accordion rule the whole app
 * follows, the copy that says what NextService is, and the footer's relationship with
 * the signed-in sidebar.
 */

test.describe('FAQ accordion', () => {
  test('Opening one answer closes the previous one', async ({ page }) => {
    await page.goto('/faq/')
    const cards = page.locator('[role="button"][aria-expanded]')
    await expect(cards.first()).toBeVisible()

    await cards.nth(0).click()
    await expect(cards.nth(0)).toHaveAttribute('aria-expanded', 'true')

    await cards.nth(1).click()
    await expect(cards.nth(1)).toHaveAttribute('aria-expanded', 'true')
    // The rule: one open at a time.
    await expect(cards.nth(0)).toHaveAttribute('aria-expanded', 'false')
  })

  test('Only the arrow closes an open card', async ({ page }) => {
    await page.goto('/faq/')
    const card = page.locator('[role="button"][aria-expanded]').first()

    await card.click()
    await expect(card).toHaveAttribute('aria-expanded', 'true')

    // Clicking the open card again must NOT collapse it — that was the behaviour
    // that kept snapping cards shut while people were reading them.
    await card.click()
    await expect(card).toHaveAttribute('aria-expanded', 'true')

    await card.getByRole('button', { name: 'Κλείσιμο' }).click()
    await expect(card).toHaveAttribute('aria-expanded', 'false')
  })

  test('Answers stay in the HTML while collapsed, for crawlers', async ({ page }) => {
    const response = await page.goto('/faq/')
    const html = (await response?.text()) ?? ''
    expect(html).toContain('Συνεργαζόμαστε με συνεργεία στην Αττική.')
  })
})

test.describe('Public copy', () => {
  // AI search quotes these back as a reason not to use the site. Where no garage
  // exists the pages claim nothing; they do not apologise for it either.
  test('The copy does not talk down the network', async ({ request }) => {
    const paths = ['/', '/faq/', '/about/', '/locations/', '/location/athens-center/', '/location/notia-proastia/', '/location/peiraias/', '/llms.txt']
    for (const path of paths) {
      const body = await (await request.get(path)).text()
      for (const phrase of ['ακόμη μικρό', 'ξεκίνησε πρόσφατα', 'Όχι ακόμη', 'Προς το παρόν', 'επεκτείνεται', 'υπό επέκταση', 'Άγιο Δημήτριο', 'ή και καμία', 'Ενεργά συνεργεία', 'Σύντομα']) {
        expect(body, `${path}: ${phrase}`).not.toContain(phrase)
      }
    }
  })

  test('We call ourselves a platform, not a marketplace', async ({ page }) => {
    for (const path of ['/faq/', '/about/']) {
      const response = await page.goto(path)
      const html = ((await response?.text()) ?? '').toLowerCase()
      expect(html).not.toContain('marketplace')
    }
  })

  test('The coverage question is answered: Attica', async ({ page }) => {
    await page.goto('/faq/')
    // The answers ship collapsed (present in the HTML, hidden by CSS), so open the
    // coverage question before asserting the reader can actually see it.
    const coverage = page.locator('[role="button"][aria-expanded]', {
      hasText: 'Σε ποιες περιοχές λειτουργείτε;',
    }).first()
    await coverage.click()
    await expect(coverage.getByText('Συνεργαζόμαστε με συνεργεία στην Αττική.')).toBeVisible()
  })
})

test.describe('Signed-in chrome', () => {
  test('Footer clears the sidebar instead of hiding behind it', async ({ page, request }) => {
    const email = `e2e-footer-${Date.now()}@test.com`
    const reg = await registerClient(request, email, 'TestPass123')
    const login = await loginViaAPI(request, email, 'TestPass123', 'client')
    await setAuthCookie(page, login.token)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.evaluate((id: string) => {
      localStorage.setItem('clientId', id)
      localStorage.setItem('userType', 'client')
    }, reg.client.id)

    await page.goto('/terms/')
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    const footerBox = await page.locator('footer').boundingBox()
    expect(footerBox).toBeTruthy()
    expect(footerBox!.x).toBeGreaterThanOrEqual((sidebarBox?.width ?? 0) - 1)
  })

  test('The profile chip in the header links to the profile', async ({ page, request }) => {
    const email = `e2e-chip-${Date.now()}@test.com`
    const reg = await registerClient(request, email, 'TestPass123')
    const login = await loginViaAPI(request, email, 'TestPass123', 'client')
    await setAuthCookie(page, login.token)

    await page.goto('/')
    await page.evaluate((id: string) => {
      localStorage.setItem('clientId', id)
      localStorage.setItem('userType', 'client')
    }, reg.client.id)
    await page.goto('/')

    const chip = page.getByLabel('Το προφίλ μου')
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('href', `/profile/${reg.client.id}/`)
  })
})

test.describe('Completed-job pages', () => {
  test('An unknown offer slug is a real 404, not a soft one', async ({ page }) => {
    const response = await page.goto('/offer/e2e-no-such-offer/')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Η εργασία δεν βρέθηκε' })).toBeVisible()
  })
})
