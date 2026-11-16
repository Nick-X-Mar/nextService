import type { Page } from '@playwright/test'

/** Pictures the app already serves, standing in for a request's uploads. */
export const PHOTOS = [
  '/images/offers/service.jpeg',
  '/images/offers/imantas.jpeg',
  '/images/offers/diskos.jpeg',
  '/images/offers/aisthitires.jpeg',
]

/** Only a presigned https URL shows as an άδεια; this one is answered below. */
export const LICENCE = 'https://e2e-photos.s3.eu-central-1.amazonaws.com/licence.jpeg'

/**
 * Gives one request photos and an άδεια in what the browser receives, the
 * real responses otherwise: uploads go to S3, which the local suite has no
 * bucket for.
 */
export async function showPhotosOn(page: Page, requestId: string) {
  await page.route(new RegExp(`/api/requests/${requestId}/\\?`), async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.request) {
      body.request.photoUrls = PHOTOS
      body.request.vehicle = { ...body.request.vehicle, licensePhotoUrl: LICENCE }
    }
    await route.fulfill({ response, json: body })
  })
  await page.route('**/api/garage/available-requests/**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const r of body.requests ?? []) if (r.id === requestId) r.photoUrls = PHOTOS
    await route.fulfill({ response, json: body })
  })
  await page.route(LICENCE, (route) => route.fulfill({ path: 'public/images/offers/phano.jpeg' }))
}

/** The photo the viewer shows, once it has loaded. */
export async function shownPhoto(page: Page) {
  return page.getByRole('dialog', { name: 'Φωτογραφίες' }).evaluate((dialog) => {
    const stage = dialog.querySelector('.touch-none') as HTMLElement
    const box = stage.getBoundingClientRect()
    const img = [...dialog.querySelectorAll('img')].find((i) => {
      const r = i.getBoundingClientRect()
      return r.left >= box.left - 1 && r.right <= box.right + 1
    })
    return img && img.complete && img.naturalWidth > 0 ? new URL(img.src).pathname : null
  })
}
