import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { TEST_GARAGE } from './helpers'
import { newGarage } from './E-helpers'
import {
  adminCookie,
  athensDatePlus,
  createOffer,
  garageToken,
  newClient,
  type TestClient,
} from './d-helpers'

/**
 * The admin's view of what clients and garages do: the request list's filters
 * and pages, and a request that shows everything that was typed into it.
 */
const VIN = 'JT1234567890ABCDE'
const PLATE = 'ΙΚΑ1234'

async function fileRequest(request: APIRequestContext, client: TestClient, category: string, extra: object = {}) {
  const resp = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${client.token}` },
    data: {
      clientId: client.clientId,
      category,
      description: 'Admin view test',
      brand: 'Toyota',
      model: 'Corolla',
      modelYear: '1999',
      engineCC: '1400',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
      ...extra,
    },
  })
  expect(resp.status(), await resp.text()).toBe(200)
  return (await resp.json()).serviceRequestId as string
}

let tins = 0
const uniqueTin = () => String(Date.now() + tins++).slice(-9)

async function signInAdmin(page: Page, admin: string) {
  await page.context().addCookies([{
    name: 'ns-admin-session',
    value: admin.split('=')[1],
    domain: 'localhost',
    path: '/',
  }])
}

test.describe.serial('Admin requests', () => {
  let client: TestClient
  let quoted: string
  let declined: string
  let admin: string
  let garage: string

  test('setup: one quoted request with a chat, one declined', async ({ request }) => {
    client = await newClient(request, 'admin-list')
    admin = await adminCookie(request)
    garage = await garageToken(request)
    quoted = await fileRequest(request, client, 'allagi-ladion', {
      vinNumber: VIN,
      licensePlate: PLATE,
      color: 'Μπλε',
    })
    declined = await fileRequest(request, client, 'imantas')
    await createOffer(request, garage, quoted, 120, [athensDatePlus(3)])

    const chat = await request.post(`/api/chat/${quoted}/messages/`, {
      headers: { Cookie: `auth-token=${garage}` },
      data: { message: 'Χρειάζομαι φωτογραφία του κινητήρα' },
    })
    expect(chat.status(), await chat.text()).toBe(200)

    const decline = await request.post('/api/garage/declines/', {
      headers: { Cookie: `auth-token=${garage}` },
      data: { requestId: declined, reason: 'more_info' },
    })
    expect(decline.status(), await decline.text()).toBe(200)
  })

  test('a request shows everything that was typed into it', async ({ request }) => {
    const resp = await request.get(`/api/admin/requests/${quoted}/`, { headers: { Cookie: admin } })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.vehicle).toMatchObject({ modelYear: '1999', vinNumber: VIN, licensePlate: PLATE, color: 'Μπλε' })
    expect(data.offers[0].offerAmount).toBe(120)
    expect(data.offers[0].availabilityDates).toHaveLength(1)
    expect(data.threads).toHaveLength(1)
    expect(data.threads[0].garageId).toBe(TEST_GARAGE.id)
    expect(data.threads[0].messages[0].message).toBe('Χρειάζομαι φωτογραφία του κινητήρα')

    const other = await (await request.get(`/api/admin/requests/${declined}/`, { headers: { Cookie: admin } })).json()
    expect(other.declines).toHaveLength(1)
    expect(other.declines[0].reason).toBe('Χρειάζομαι να δω το αυτοκίνητο από κοντά')
  })

  test('the list filters and counts by client, status, category and offers', async ({ request }) => {
    const list = async (qs: string) => {
      const resp = await request.get(`/api/admin/requests/list/?${qs}`, { headers: { Cookie: admin } })
      expect(resp.status()).toBe(200)
      return resp.json()
    }

    const all = await list(`clientId=${client.clientId}`)
    expect(all.total).toBe(2)
    expect(all.byStatus.pending).toBe(2)
    expect(all.pendingNoOffers).toBe(1)
    expect(all.client.id).toBe(client.clientId)
    const row = all.items.find((r: { id: string }) => r.id === quoted)
    expect(row).toMatchObject({ offerCount: 1, messageCount: 1, declineCount: 0 })
    expect(row.vehicle.label).toBe('Toyota Corolla 1999')
    expect(all.items.find((r: { id: string }) => r.id === declined).declineCount).toBe(1)

    expect((await list(`q=${encodeURIComponent(client.email)}`)).total).toBe(2)
    expect((await list(`q=${encodeURIComponent(PLATE.toLowerCase())}&clientId=${client.clientId}`)).total).toBe(1)
    expect((await list(`clientId=${client.clientId}&category=imantas`)).items[0].id).toBe(declined)
    expect((await list(`clientId=${client.clientId}&offers=none`)).items[0].id).toBe(declined)
    expect((await list(`clientId=${client.clientId}&offers=some`)).items[0].id).toBe(quoted)

    // The status filter leaves the status counts alone, so the tiles keep their numbers.
    const cancelled = await list(`clientId=${client.clientId}&status=cancelled`)
    expect(cancelled.total).toBe(0)
    expect(cancelled.byStatus.pending).toBe(2)
  })

  test('the list pages through every request', async ({ request }) => {
    const get = async (page: number) =>
      (await request.get(`/api/admin/requests/list/?pageSize=1&clientId=${client.clientId}&page=${page}`, {
        headers: { Cookie: admin },
      })).json()
    const [first, second, past] = [await get(1), await get(2), await get(9)]
    expect(first.total).toBe(2)
    expect(first.items).toHaveLength(1)
    expect(second.items[0].id).not.toBe(first.items[0].id)
    expect(past.page).toBe(2)
  })

  test('each request says who it is waiting on', async ({ request }) => {
    const waitingFor = async (id: string) =>
      (await (await request.get(`/api/admin/requests/${id}/`, { headers: { Cookie: admin } })).json()).waiting as
        { on: string; reason: string; garageId?: string }[]

    // No offer and no chat: the garages have to answer.
    expect(await waitingFor(declined)).toEqual([
      expect.objectContaining({ on: 'garage', reason: 'Κανένα συνεργείο δεν έχει απαντήσει ακόμα' }),
    ])

    // The garage asked something and quoted: both are the client's turn.
    const asked = await waitingFor(quoted)
    expect(asked.map((w) => w.on)).toEqual(['client', 'client'])
    expect(asked[0].reason).toContain('Να απαντήσει στο μήνυμα')
    expect(asked[1].reason).toBe('Να αποδεχτεί την προσφορά και να κλείσει ημερομηνία')

    // The client answers: the conversation is back with the garage.
    const reply = await request.post(`/api/chat/${quoted}/messages/`, {
      headers: { Cookie: `auth-token=${client.token}` },
      data: { message: 'Ορίστε', garageId: TEST_GARAGE.id },
    })
    expect(reply.status(), await reply.text()).toBe(200)
    const answered = await waitingFor(quoted)
    expect(answered[0]).toMatchObject({ on: 'garage', reason: 'Να απαντήσει στον πελάτη', garageId: TEST_GARAGE.id })

    // The client asks for a day the offer does not have.
    const offerId = ((await (await request.get(`/api/admin/requests/${quoted}/`, { headers: { Cookie: admin } })).json()).offers[0]).id
    const dates = await request.patch(`/api/offers/${offerId}/client-availability/`, {
      headers: { Cookie: `auth-token=${client.token}` },
      data: { clientAvailabilityDates: [athensDatePlus(9)] },
    })
    expect(dates.status(), await dates.text()).toBe(200)
    const proposed = await waitingFor(quoted)
    expect(proposed.map((w) => w.reason)).toContain('Να απαντήσει στις ημερομηνίες που πρότεινε ο πελάτης')

    const list = await (await request.get(`/api/admin/requests/list/?clientId=${client.clientId}&waiting=client`, {
      headers: { Cookie: admin },
    })).json()
    expect(list.total).toBe(0)
    expect(list.byWaiting).toMatchObject({ client: 0, garage: 2 })
  })

  test('the clients list finds a client and counts their requests', async ({ request }) => {
    const resp = await request.get(`/api/admin/users/clients/?search=${encodeURIComponent(client.email)}`, {
      headers: { Cookie: admin },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.total).toBe(1)
    expect(data.items[0].requestCount).toBe(2)

    const newest = await (await request.get('/api/admin/users/clients/?pageSize=25', { headers: { Cookie: admin } })).json()
    const dates = (newest.items as { createdAt: string }[]).map((c) => c.createdAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  test('Pending Requests on the dashboard opens the list filtered to pending', async ({ page }) => {
    await signInAdmin(page, admin)
    await page.goto('/admin/dashboard/')
    await page.getByRole('link', { name: /Pending Requests/ }).click()
    await expect(page).toHaveURL(/\/admin\/requests\/\?status=pending/)
    await expect(page.getByTestId('status-pending')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Status')).toHaveValue('pending')
  })

  test('the status tiles, the search and the client filter drive the list', async ({ page }) => {
    await signInAdmin(page, admin)
    await page.goto('/admin/requests/')
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 60_000 })
    await page.getByLabel('Search requests').fill(client.email)
    await expect(page).toHaveURL(/q=/)
    await expect(page.getByRole('row')).toHaveCount(3)

    await page.getByTestId('status-cancelled').click()
    await expect(page).toHaveURL(/status=cancelled/)
    await expect(page.getByText('No requests match these filters')).toBeVisible()

    // Pressing the active tile takes its filter off.
    await page.getByTestId('status-cancelled').click()
    await expect(page).not.toHaveURL(/status=/)
    await expect(page.getByRole('row')).toHaveCount(3)

    await page.getByTestId('waiting-garage').click()
    await expect(page).toHaveURL(/waiting=garage/)
    await expect(page.getByRole('row')).toHaveCount(3)
    await page.getByTestId('waiting-client').click()
    await expect(page.getByText('No requests match these filters')).toBeVisible()
    await page.getByTestId('waiting-client').click()
    await expect(page.getByRole('row')).toHaveCount(3)

    await page.getByTitle("Show this client's requests").first().click()
    await expect(page.getByTestId('client-filter')).toContainText('Client:')
    await expect(page).toHaveURL(new RegExp(`clientId=${client.clientId}`))

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/admin\/requests\/$/)
    await expect(page.getByLabel('Search requests')).toHaveValue('')
  })

  test('a request page shows the conversation and the decline', async ({ page }) => {
    await signInAdmin(page, admin)
    await page.goto(`/admin/requests/${quoted}/`)
    await expect(page.getByText('1999', { exact: true })).toBeVisible()
    await expect(page.getByText(VIN)).toBeVisible()
    await expect(page.getByText('120€ + ΦΠΑ')).toBeVisible()
    await expect(page.getByTestId('waiting-panel')).toContainText('Να απαντήσει στον πελάτη')
    await expect(page.getByTestId('admin-threads')).toContainText('Χρειάζομαι φωτογραφία του κινητήρα')

    await page.goto(`/admin/requests/${declined}/`)
    await expect(page.getByTestId('admin-declines')).toContainText('Χρειάζομαι να δω το αυτοκίνητο από κοντά')
  })

  test('no sideways scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await signInAdmin(page, admin)
    for (const path of ['/admin/requests/', `/admin/requests/${quoted}/`, '/admin/users/']) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(360)
    }
  })
})

test.describe('A garage\'s page', () => {
  test('shows and edits everything about it, under Garages', async ({ page, request }) => {
    const admin = await adminCookie(request)
    const garage = await newGarage(request, { prefix: 'admin-page' })
    await signInAdmin(page, admin)
    await page.goto('/admin/garages/')
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 60_000 })
    await page.getByPlaceholder('Search by name or email...').fill(garage.email)
    await expect(page.getByRole('row')).toHaveCount(2, { timeout: 60_000 })
    await page.getByRole('cell', { name: garage.email }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/garages/${garage.id}/`), { timeout: 60_000 })

    // Still under Garages in the menu, with the rate and the money on the page.
    await expect(page.getByRole('link', { name: 'Garages' })).toHaveClass(/inverse|primary|bg-/)
    await expect(page.getByTestId('commission-rate')).toContainText('15%')
    await page.getByLabel('Ποσοστό προμήθειας', { exact: true }).fill('10')
    await page.getByRole('button', { name: 'Αποθήκευση', exact: true }).click()
    await expect(page.getByTestId('commission-rate')).toContainText('(συμφωνημένο)')

    await page.getByLabel('Κινητό').fill('6912345678')
    await page.getByLabel('ΑΦΜ', { exact: true }).fill(uniqueTin())
    await page.getByLabel('Περιοχή').fill('Χαλάνδρι')
    await page.getByRole('group', { name: 'Τύπος επιχείρησης' }).getByRole('button', { name: 'Βουλκανιζατέρ' }).click()
    await page.getByRole('button', { name: 'Αποθήκευση στοιχείων' }).click()
    await expect(page.getByText('Τα στοιχεία αποθηκεύτηκαν')).toBeVisible({ timeout: 30_000 })

    const stored = await (await request.get(`/api/admin/users/garages/${garage.id}/`, { headers: { Cookie: admin } })).json()
    expect(stored.area).toBe('Χαλάνδρι')
    expect(stored.businessTypes).toContain('tyres')
    expect(stored.rate.commissionPercent).toBe(10)
    expect(stored.ledger.totals).toBeTruthy()
    expect(JSON.stringify(stored)).not.toContain('passwordHash')
  })

  test('an old /admin/users link to a garage lands on its page', async ({ page, request }) => {
    const admin = await adminCookie(request)
    const garage = await newGarage(request, { prefix: 'admin-old-link' })
    await signInAdmin(page, admin)
    await page.goto(`/admin/users/${garage.id}/`)
    await expect(page).toHaveURL(new RegExp(`/admin/garages/${garage.id}/`), { timeout: 60_000 })
  })

  test('a bad or taken ΑΦΜ is refused', async ({ request }) => {
    const admin = await adminCookie(request)
    const [garage, other] = [
      await newGarage(request, { prefix: 'admin-edit' }),
      await newGarage(request, { prefix: 'admin-edit-other' }),
    ]
    const current = await (await request.get(`/api/admin/users/garages/${garage.id}/`, { headers: { Cookie: admin } })).json()
    const base = { ...current, mobile: '6912345678', tin: uniqueTin() }
    const taken = await (await request.get(`/api/admin/users/garages/${other.id}/`, { headers: { Cookie: admin } })).json()

    const bad = await request.put(`/api/admin/users/garages/${garage.id}/`, {
      headers: { Cookie: admin },
      data: { ...base, tin: '12' },
    })
    expect(bad.status()).toBe(400)

    const clash = await request.put(`/api/admin/users/garages/${garage.id}/`, {
      headers: { Cookie: admin },
      data: { ...base, email: taken.email },
    })
    expect(clash.status()).toBe(409)
  })
})

test.describe('Approving a garage', () => {
  test('the rate agreed on the call is stored with the approval', async ({ page, request }) => {
    const admin = await adminCookie(request)
    const garage = await newGarage(request, { active: false, prefix: 'approve-rate' })
    await signInAdmin(page, admin)
    await page.goto('/admin/garages/?tab=pending')
    await expect(page.getByRole('row').nth(1)).toBeVisible({ timeout: 60_000 })
    await page.getByPlaceholder('Search by name or email...').fill(garage.email)
    await expect(page.getByRole('row')).toHaveCount(2, { timeout: 60_000 })
    await expect(page.getByRole('link', { name: '15%' })).toHaveAttribute('href', `/admin/commissions/${garage.id}/`)

    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByLabel('Ποσοστό προμήθειας (%)')).toHaveValue('15')
    await page.getByLabel('Ποσοστό προμήθειας (%)').fill('150')
    await page.getByRole('button', { name: 'Έγκριση' }).click()
    await expect(page.getByLabel('Ποσοστό προμήθειας (%)')).toBeVisible()

    await page.getByLabel('Ποσοστό προμήθειας (%)').fill('12.5')
    await page.getByRole('button', { name: 'Έγκριση' }).click()
    await expect(page.getByText('No garages found')).toBeVisible()

    const commissions = await (await request.get(`/api/admin/commissions/garage/${garage.id}/`, {
      headers: { Cookie: admin },
    })).json()
    expect(commissions.commissionPercent).toBe(12.5)
    expect(commissions.hasCustomRate).toBe(true)
  })

  test('approved at the default it stays on the default, and a bad rate approves nothing', async ({ request }) => {
    const admin = await adminCookie(request)
    const garage = await newGarage(request, { active: false, prefix: 'approve-default' })

    const refused = await request.post(`/api/admin/users/garages/${garage.id}/activate/`, {
      headers: { Cookie: admin },
      data: { commissionPercent: 150 },
    })
    expect(refused.status()).toBe(400)
    const still = await (await request.get(`/api/admin/users/garages/?status=pending&search=${encodeURIComponent(garage.email)}`, {
      headers: { Cookie: admin },
    })).json()
    expect(still.total).toBe(1)

    const ok = await request.post(`/api/admin/users/garages/${garage.id}/activate/`, {
      headers: { Cookie: admin },
      data: {},
    })
    expect(ok.status()).toBe(200)
    const commissions = await (await request.get(`/api/admin/commissions/garage/${garage.id}/`, {
      headers: { Cookie: admin },
    })).json()
    expect(commissions.commissionPercent).toBe(15)
    expect(commissions.hasCustomRate).toBe(false)
  })
})
