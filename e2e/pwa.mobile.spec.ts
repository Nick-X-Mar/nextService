import { test, expect, type Page } from '@playwright/test'
import { newClient } from './E-helpers'
import { setAuthCookie } from './helpers'

/**
 * The /app/ page on a phone (the `mobile-*` projects): the steps it gives
 * are the phone's own, and nothing spills sideways at 360px. And the card
 * that offers the app where sending a request lands, on the client's
 * requests.
 */

// The config answers that card «Όχι τώρα» for every other spec.
test.use({ storageState: { cookies: [], origins: [] } })

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, width } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }))
  expect(scrollWidth, `page is ${scrollWidth}px wide on a ${width}px screen`).toBeLessThanOrEqual(width)
}

test('The app page gives this phone’s install steps and fits the screen', async ({ page }) => {
  await page.goto('/app/')
  const iphone = test.info().project.name === 'mobile-iphone'
  await expect(page.getByRole('heading', { name: iphone ? 'Στο iPhone ή στο iPad' : 'Στο κινητό σου' })).toBeVisible()
  if (iphone) await expect(page.getByText('Προσθήκη στην οθόνη Αφετηρίας')).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('On an iPhone, notifications point to the app; the profile card fits the screen', async ({ page, request }) => {
  const client = await newClient(request, 'pwa-mobile')
  await setAuthCookie(page, client.token)
  await page.goto(`/profile/${client.clientId}/`)
  await expect(page.getByRole('heading', { name: 'Εφαρμογή & ειδοποιήσεις' })).toBeVisible()
  if (test.info().project.name === 'mobile-iphone') {
    await expect(page.getByText('Στο iPhone οι ειδοποιήσεις έρχονται μόνο στην εφαρμογή NextService.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Δες πώς μπαίνει στην οθόνη σου' })).toHaveAttribute('href', '/app/')
  }
  await expectNoSidewaysScroll(page)
})

test('After sending a request, the requests page offers the app; «Όχι τώρα» puts it away', async ({ page, request }) => {
  const client = await newClient(request, 'pwa-nudge')
  await setAuthCookie(page, client.token)
  await page.goto(`/requests/${client.clientId}/`)
  await expect(page.getByRole('heading', { name: 'Τα Αιτήματά μου' })).toBeVisible({ timeout: 30_000 })
  const card = page.getByRole('region', { name: 'Η εφαρμογή NextService' })
  await expect(card).toBeVisible()
  await expectNoSidewaysScroll(page)

  // No one-tap offer in a test browser: the button leads to the phone's steps.
  await card.getByRole('button', { name: 'Δες πώς' }).click()
  await page.waitForURL('**/app/')

  await page.goto(`/requests/${client.clientId}/`)
  await card.getByRole('button', { name: 'Όχι τώρα' }).click()
  await expect(card).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Τα Αιτήματά μου' })).toBeVisible()
  await expect(card).toBeHidden()
})

test('A visitor finds the app in the bottom bar and the menu, both marked to stay out of the installed app', async ({ page }) => {
  await page.goto('/')
  // The bottom bar is the page's last <nav>; the footer has an Εφαρμογή link of its own.
  const barLink = page.locator('nav').last().locator('a[href="/app/"]')
  await expect(barLink).toHaveText(/Εφαρμογή/)
  await expect(barLink).toBeVisible()
  await page.getByRole('button', { name: 'Μενού' }).click()
  const menuLink = page.getByRole('link', { name: /Η εφαρμογή NextService/ })
  await expect(menuLink).toBeVisible()
  await expectNoSidewaysScroll(page)

  // No browser here can be put in display-mode: standalone (Chromium ignores
  // it as an emulated media feature), so check what the app would apply: both
  // links (and the footer's) carry .browser-only, hidden in the installed app.
  for (const link of await page.locator('a[href="/app/"]').all()) {
    await expect(link).toHaveClass(/\bbrowser-only\b/)
  }
  const hiddenInApp = await page.evaluate(() => [...document.styleSheets]
    .flatMap((sheet) => { try { return [...sheet.cssRules] } catch { return [] } })
    .some((rule) => rule instanceof CSSMediaRule
      && rule.conditionText.includes('display-mode: standalone')
      && [...rule.cssRules].some((inner) => inner instanceof CSSStyleRule
        && inner.selectorText === '.browser-only' && inner.style.display === 'none')))
  expect(hiddenInApp, '.browser-only is hidden in display-mode: standalone').toBe(true)
})
