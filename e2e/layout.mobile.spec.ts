import { test, expect, type Page, type Locator } from '@playwright/test'
import { newClient, newGarage, newRequest, makeOffer, signInGarage, type Party } from './p-helpers'
import { setAuthCookie } from './helpers'
import { seedDraft } from './b-helpers'

/**
 * The phone layout, on an iPhone and a 360px Android (the `mobile-*`
 * projects). Each check here is a bug a phone user actually hit: a page that
 * scrolled sideways, a field that made iOS zoom in, a submit button under the
 * bottom bar, a sheet behind it.
 */

/** Fails if the page is wider than the screen — it then pans sideways under the thumb. */
async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, width } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }))
  expect(scrollWidth, `page is ${scrollWidth}px wide on a ${width}px screen`).toBeLessThanOrEqual(width)
}

/** Whether a tap on the element's centre lands on it, not on a bar painted over it. */
async function isTappable(target: Locator) {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (el === hit || el.contains(hit))
  })
}

async function signInClient(page: Page, client: Party) {
  await setAuthCookie(page, client.token)
  await page.goto('/')
  await page.evaluate((id) => {
    localStorage.setItem('clientId', id)
    localStorage.setItem('userType', 'client')
  }, client.id)
}

test.describe('Public pages fit the screen', () => {
  for (const path of ['/', '/about/', '/faq/', '/locations/', '/location/peiraias/', '/offer/set_disk_all_cars/', '/terms/', '/login/', '/register-professional/']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle').catch(() => {})
      await expectNoSidewaysScroll(page)
    })
  }
})

test.describe.serial('Signed-in screens', () => {
  let client: Party
  let garage: Party
  let requestId: string

  test('Setup: a client with a request one garage has quoted, and a garage', async () => {
    client = await newClient('mobile')
    garage = await newGarage('mobile')
    requestId = (await newRequest(client, { licensePlate: 'ΙΚΧ5555', vinNumber: 'VF3MOBILE00000001', engineNumber: 'HN05555' })).requestId
    await makeOffer(garage, requestId)
  })

  test('The request page, with its photo buttons and the offer, fits the screen', async ({ page }) => {
    await signInClient(page, client)
    await page.goto(`/requests/${client.id}/details/${requestId}/`)
    await expect(page.getByText('Προσφορές από Συνεργεία')).toBeVisible({ timeout: 30_000 })
    await expectNoSidewaysScroll(page)
  })

  test('The offer form calendar stays inside its card', async ({ page }) => {
    const other = (await newRequest(client, { licensePlate: 'ΙΚΧ5556', vinNumber: 'VF3MOBILE00000002', engineNumber: 'HN05556' })).requestId
    await signInGarage(page, garage)
    await page.goto(`/garage-dashboard/${garage.id}/offers/${other}/`)
    const calendar = page.locator('.rdp-root')
    await expect(calendar).toBeVisible({ timeout: 30_000 })
    const [calendarBox, gridBox] = await Promise.all([calendar.boundingBox(), page.locator('.rdp-month_grid').boundingBox()])
    expect(gridBox!.x + gridBox!.width).toBeLessThanOrEqual(calendarBox!.x + calendarBox!.width + 1)
    await expectNoSidewaysScroll(page)
  })

  test('Typing a chat message does not make iOS zoom in', async ({ page }) => {
    await signInClient(page, client)
    await page.goto(`/requests/${client.id}/chats/${requestId}/?garageId=${garage.id}`)
    const composer = page.getByPlaceholder('Γράψτε μήνυμα...')
    await expect(composer).toBeVisible({ timeout: 30_000 })
    // Safari zooms the page into any focused field under 16px.
    const size = await composer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  })
})

test('Every field on the login form is at least 16px', async ({ page }) => {
  await page.goto('/login/')
  const sizes = await page.locator('input:not([type="checkbox"]):not([type="radio"])').evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).fontSize))
  )
  expect(sizes.length).toBeGreaterThan(0)
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16)
})

test('The bodywork request can be sent: its button is not under the bottom bar', async ({ page }) => {
  await seedDraft(page, { category: 'meriki-vafi', description: 'Γρατζουνιά στην πόρτα', brand: 'Fiat', model: 'Punto', modelYear: '2015', owner: 'guest' }, '/car-specifications/')
  const submit = page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })
  await expect(submit).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await isTappable(submit)).toBe(true)
  expect(await isTappable(page.getByRole('button', { name: 'Επιστροφή' }))).toBe(true)
})

test('The mobile field and its country picker fit a phone screen', async ({ page }) => {
  await seedDraft(page, { category: 'meriki-vafi', description: 'Γρατζουνιά στην πόρτα', brand: 'Fiat', model: 'Punto', modelYear: '2015', owner: 'guest' }, '/car-specifications/')
  await page.locator('#guest-email').fill(`e2e-mobile-phone-${Date.now()}@test.com`)
  const phone = page.locator('#guest-phone')
  await expect(phone).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(parseFloat(await phone.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  const picker = page.getByLabel('Χώρα κινητού')
  await picker.scrollIntoViewIfNeeded()
  expect(await isTappable(picker)).toBe(true)
})

test('A sheet opens above the bottom bar: the last category can be tapped', async ({ page }) => {
  await page.goto('/car-details/?new=1')
  const last = page.getByRole('button', { name: /Αλλαγή λαδιών/ })
  await expect(last).toBeVisible({ timeout: 30_000 })
  await last.scrollIntoViewIfNeeded()
  expect(await isTappable(last)).toBe(true)
})

test('The offer page leaves the footer reachable under its sticky button', async ({ page }) => {
  await page.goto('/offer/set_disk_all_cars/')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const email = page.getByRole('link', { name: 'Email' })
  await expect(email).toBeVisible()
  expect(await isTappable(email)).toBe(true)
})
