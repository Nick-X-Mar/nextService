import { test, expect, type Page } from '@playwright/test'
import { newClient, newGarage, newRequest, signInGarage } from './E-helpers'
import { PHOTOS, showPhotosOn, shownPhoto } from './photo-helpers'

const viewer = (page: Page) => page.getByRole('dialog', { name: 'Φωτογραφίες' })
const counter = (page: Page) => viewer(page).getByText(/^\d+ \/ \d+$/)

/** A one-finger swipe across the photo (Chromium only: it goes through the DevTools protocol). */
async function swipe(page: Page, dx: number) {
  const box = (await viewer(page).locator('.touch-none').boundingBox())!
  const y = box.y + box.height / 2
  const x0 = box.x + box.width / 2 - dx / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 10, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('On a phone the photos fill the screen and swipe sideways', async ({ page, request, browserName }) => {
  const client = await newClient(request, 'photos-m')
  const garage = await newGarage(request, { prefix: 'photos-m' })
  const model = `PhotoM${Date.now()}`
  const requestId = await newRequest(request, client, { brand: 'Fiat', model })

  await signInGarage(page, garage)
  await showPhotosOn(page, requestId)
  await page.goto(`/garage-dashboard/${garage.id}/offers/${requestId}/`)
  await page.getByRole('button', { name: 'Άνοιγμα φωτογραφίας 1' }).click({ timeout: 30_000 })
  await expect(counter(page)).toHaveText(`1 / ${PHOTOS.length}`)
  await expect.poll(() => shownPhoto(page)).toBe(PHOTOS[0])

  // Over everything, the bottom bar included, and nothing sideways at 360px.
  const width = page.viewportSize()!.width
  const box = (await viewer(page).boundingBox())!
  expect(box.width).toBe(width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  const close = viewer(page).getByRole('button', { name: 'Κλείσιμο' })
  await expect(close).toBeInViewport()
  // Phones swipe; the arrows are for a mouse.
  await expect(viewer(page).getByRole('button', { name: 'Επόμενη φωτογραφία' })).toBeHidden()

  if (browserName === 'chromium') {
    await swipe(page, -200)
    await expect(counter(page)).toHaveText(`2 / ${PHOTOS.length}`)
    await expect.poll(() => shownPhoto(page)).toBe(PHOTOS[1])
    await swipe(page, 200)
    await expect(counter(page)).toHaveText(`1 / ${PHOTOS.length}`)
  }

  // The dots move too.
  await viewer(page).getByRole('button', { name: `Φωτογραφία ${PHOTOS.length}` }).click()
  await expect(counter(page)).toHaveText(`${PHOTOS.length} / ${PHOTOS.length}`)

  await close.click()
  await expect(viewer(page)).toBeHidden()
})

test('On a phone the chat\'s request details show the photos and the άδεια without going sideways', async ({ page, request }) => {
  const client = await newClient(request, 'chat-photos-m')
  const garage = await newGarage(request, { prefix: 'chat-photos-m' })
  const requestId = await newRequest(request, client, { brand: 'Kia', model: `SorentoM${Date.now()}` })

  await signInGarage(page, garage)
  await showPhotosOn(page, requestId)
  await page.goto(`/garage-dashboard/${garage.id}/chat/${requestId}/`)
  await page.getByText('Λεπτομέρειες', { exact: true }).click({ timeout: 30_000 })

  // The photos come first, on one row: in view the moment the panel opens,
  // though it gets less than half of a phone's screen.
  await expect(page.getByRole('button', { name: 'Άνοιγμα φωτογραφίας 1' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Άνοιγμα φωτογραφίας 2' })).toBeInViewport()
  // More than fit across scroll inside the row, never the page.
  const last = page.getByRole('button', { name: `Άνοιγμα φωτογραφίας ${PHOTOS.length}` })
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
  const licence = page.getByRole('button', { name: 'Άνοιγμα άδειας κυκλοφορίας' })
  await licence.scrollIntoViewIfNeeded()
  await expect(licence).toBeInViewport()
  const width = page.viewportSize()!.width
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

  await licence.click()
  await expect(viewer(page)).toBeVisible()
  await expect(counter(page)).toHaveCount(0)
})
