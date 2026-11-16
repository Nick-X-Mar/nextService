import { test, expect, type Page } from '@playwright/test'
import { newClient, newGarage, newRequest, signInGarage } from './E-helpers'
import { PHOTOS, LICENCE, showPhotosOn, shownPhoto } from './photo-helpers'

const viewer = (page: Page) => page.getByRole('dialog', { name: 'Φωτογραφίες' })
const counter = (page: Page) => viewer(page).getByText(/^\d+ \/ \d+$/)

/** Drags the photo sideways with the mouse, the way the hot deals row moves. */
async function dragPhoto(page: Page, dx: number) {
  const box = (await viewer(page).locator('.touch-none').boundingBox())!
  const y = box.y + box.height / 2
  const x = box.x + box.width / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 12 })
  await page.mouse.up()
}

test.describe('Photos open inside the app', () => {
  test('A garage goes through a request\'s photos without leaving the page', async ({ page, request }) => {
    const client = await newClient(request, 'photos')
    const garage = await newGarage(request, { prefix: 'photos' })
    const model = `Photo${Date.now()}`
    const requestId = await newRequest(request, client, { brand: 'Fiat', model })
    const newTabs: string[] = []
    page.context().on('page', (p) => newTabs.push(p.url()))

    await signInGarage(page, garage)
    await showPhotosOn(page, requestId)
    const dashboard = `/garage-dashboard/${garage.id}/`
    await page.goto(dashboard)

    // From the feed: the thumbnail opens the photos, not the request behind it.
    const card = page.locator('article', { hasText: model })
    await card.getByRole('button', { name: 'Άνοιγμα φωτογραφίας 2' }).click({ timeout: 30_000 })
    await expect(viewer(page)).toBeVisible()
    await expect(counter(page)).toHaveText(`2 / ${PHOTOS.length}`)
    await expect.poll(() => shownPhoto(page)).toBe(PHOTOS[1])

    // Arrows, keys, and a drag with the mouse.
    await viewer(page).getByRole('button', { name: 'Επόμενη φωτογραφία' }).click()
    await expect(counter(page)).toHaveText(`3 / ${PHOTOS.length}`)
    await page.keyboard.press('ArrowLeft')
    await expect(counter(page)).toHaveText(`2 / ${PHOTOS.length}`)
    await dragPhoto(page, -250)
    await expect(counter(page)).toHaveText(`3 / ${PHOTOS.length}`)
    await expect.poll(() => shownPhoto(page)).toBe(PHOTOS[2])
    await dragPhoto(page, 250)
    await expect(counter(page)).toHaveText(`2 / ${PHOTOS.length}`)
    // A short nudge is not a swipe.
    await dragPhoto(page, -20)
    await expect(counter(page)).toHaveText(`2 / ${PHOTOS.length}`)

    await page.keyboard.press('Escape')
    await expect(viewer(page)).toBeHidden()
    expect(new URL(page.url()).pathname).toBe(dashboard)

    // On the request itself: the first photo has nothing before it, and a
    // click beside the photo closes the viewer.
    await page.goto(`/garage-dashboard/${garage.id}/offers/${requestId}/`)
    await page.getByRole('button', { name: 'Άνοιγμα φωτογραφίας 1' }).click({ timeout: 30_000 })
    await expect(counter(page)).toHaveText(`1 / ${PHOTOS.length}`)
    await expect(viewer(page).getByRole('button', { name: 'Προηγούμενη φωτογραφία' })).toBeDisabled()
    await dragPhoto(page, 250)
    await expect(counter(page)).toHaveText(`1 / ${PHOTOS.length}`)
    const stage = (await viewer(page).locator('.touch-none').boundingBox())!
    await page.mouse.click(stage.x + 10, stage.y + 10)
    await expect(viewer(page)).toBeHidden()

    // The άδεια: one photo, no counter, and a double click zooms in to read it.
    await page.getByRole('button', { name: 'Άνοιγμα άδειας κυκλοφορίας' }).click()
    await expect(viewer(page)).toBeVisible()
    await expect(counter(page)).toHaveCount(0)
    await expect.poll(() => shownPhoto(page)).toBe(new URL(LICENCE).pathname)
    const photo = viewer(page).locator('img')
    await photo.dblclick()
    await expect(photo).toHaveCSS('transform', /matrix\(2\.5, 0, 0, 2\.5/)
    // Zoomed in, a drag moves the photo instead of closing or changing it.
    await dragPhoto(page, -100)
    await expect(viewer(page)).toBeVisible()
    await photo.dblclick()
    await expect(photo).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, 0\)|none/)
    await viewer(page).getByRole('button', { name: 'Κλείσιμο' }).click()
    await expect(viewer(page)).toBeHidden()

    expect(newTabs).toEqual([])
  })
})
