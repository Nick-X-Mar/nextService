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

/** WebKit keeps scrolling after the call returns, and the geometry read then is stale. */
async function scrollSettled(page: Page) {
  await expect.poll(async () => {
    const before = await page.evaluate(() => window.scrollY)
    await page.waitForTimeout(150)
    return before === (await page.evaluate(() => window.scrollY))
  }).toBe(true)
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

  // The logo's charcoal SERVICE and gear disappear on the landing photo.
  test('The header logo is the light one on the photo and the dark one on the plain header', async ({ page }) => {
    const logo = page.locator('header img[alt="NextService"]')
    await page.goto('/')
    await expect(logo).toHaveAttribute('src', /next_logo_on_dark\.svg/)
    await page.goto('/about/')
    await expect(logo).toHaveAttribute('src', /next_logo\.svg/)
  })
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
  // The terms checkbox sits in the bar above the button; the page's last lines
  // must still scroll clear of that taller bar.
  expect(await isTappable(page.getByRole('checkbox'))).toBe(true)
  expect(await isTappable(page.getByText('Συμπεριλάβετε το περιβάλλον της ζημιάς'))).toBe(true)
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

test('The homepage search opens with its last option tappable and the scroll cue clear of it', async ({ page }) => {
  await page.goto('/')
  const last = page.getByText('Αλλαγή λαδιών')
  // Before hydration every row is opaque in a list still closed, so the button
  // says it opened, and then the last row's opacity says the opening finished.
  await expect(page.getByRole('button', { name: 'Κλείσιμο επιλογών' })).toBeVisible({ timeout: 30_000 })
  await expect(last.locator('../..')).toHaveCSS('opacity', '1')
  // The centre, as a thumb would bring it: "in view" also holds under the BottomNav.
  await last.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await scrollSettled(page)
  expect(await isTappable(last)).toBe(true)

  const cue = page.getByRole('button', { name: 'Ολοκληρωμένες εργασίες' })
  await cue.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await scrollSettled(page)
  const [lastBox, cueBox] = await Promise.all([last.boundingBox(), cue.boundingBox()])
  expect(cueBox!.y).toBeGreaterThan(lastBox!.y + lastBox!.height)
  expect(await isTappable(cue)).toBe(true)
  await expectNoSidewaysScroll(page)
})

test('The hot deals move under a finger, and the page still scrolls over them', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#offers')
  await section.scrollIntoViewIfNeeded()
  const first = section.getByRole('button', { name: 'Εργασία 1', exact: true })
  await expect(first).toHaveAttribute('aria-current', 'true', { timeout: 30_000 })

  const card = section.locator('.select-none')
  await expect(card).toHaveCSS('touch-action', 'pan-y')
  await scrollSettled(page)
  const box = (await section.getByRole('heading', { level: 2 }).boundingBox())!
  const y = box.y + 220
  await page.mouse.move(300, y)
  await page.mouse.down()
  await page.mouse.move(220, y, { steps: 5 })
  await page.mouse.move(120, y, { steps: 5 })
  await page.mouse.up()
  await expect(first).toHaveAttribute('aria-current', 'false')
  await expect(section.getByRole('button', { name: 'Εργασία 2', exact: true })).toHaveAttribute('aria-current', 'true')

  // Back the other way.
  await page.waitForTimeout(700)
  await page.mouse.move(120, y)
  await page.mouse.down()
  await page.mouse.move(220, y, { steps: 5 })
  await page.mouse.move(300, y, { steps: 5 })
  await page.mouse.up()
  await expect(first).toHaveAttribute('aria-current', 'true')
})

test('The offer page leaves the footer reachable under its sticky button', async ({ page }) => {
  await page.goto('/offer/set_disk_all_cars/')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const email = page.getByRole('link', { name: 'Email' })
  await expect(email).toBeVisible()
  expect(await isTappable(email)).toBe(true)
})
