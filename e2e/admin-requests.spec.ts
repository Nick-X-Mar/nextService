import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { TEST_GARAGE } from './helpers'
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

  test('the clients list finds a client and counts their requests', async ({ request }) => {
    const resp = await request.get(`/api/admin/users/clients/?search=${encodeURIComponent(client.email)}`, {
      headers: { Cookie: admin },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.total).toBe(1)
    expect(data.items[0].requestCount).toBe(2)

    const newest = await (await request.get('/api/admin/users/clients/?pageSize=1', { headers: { Cookie: admin } })).json()
    expect(newest.items[0].id).toBe(client.clientId)
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
