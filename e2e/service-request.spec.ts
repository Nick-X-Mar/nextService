import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, setAuthCookie, TEST_GARAGE } from './helpers'
import {
  clientsWithEmail,
  eventsOfVisitor,
  freshClient,
  getRow,
  mechanicalRequest,
  newGuest,
  readDraft,
  requestsForClient,
  requestsWithDescription,
  seedDraft,
  setClientFields,
  setLicensePhotoKey,
  setVehicleFields,
  TINY_PNG,
  uniqueMarker,
  vehiclesWithModel,
  visitorOfRequest,
} from './b-helpers'
import { loginAdmin } from './E-helpers'
import { TABLES } from '../src/lib/tables'

const CLIENT_EMAIL = `e2e-sr-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let clientToken: string
let serviceRequestId: string

test.describe.serial('Service Request lifecycle', () => {

  test('Setup: register client', async ({ request }) => {
    const regResult = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = regResult.client.id
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = login.token
  })

  test('Create request with missing fields fails', async ({ request }) => {
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { clientId, category: '', brand: '', model: '' },
    })
    expect(resp.status()).toBe(400)
  })

  test('Create valid service request', async ({ request }) => {
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'symplektis',
        description: 'E2E SR test: αλλαγή συμπλέκτη',
        brand: 'Ford',
        model: 'Focus',
        modelYear: '2017',
        engineCC: '1500',
        fuelType: 'diesel',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    serviceRequestId = data.serviceRequestId
    expect(serviceRequestId).toMatch(/^sr-/)
  })

  test('Request appears in client requests list', async ({ request }) => {
    const resp = await request.get(`/api/requests?clientId=${clientId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const found = data.requests?.find((r: { id: string }) => r.id === serviceRequestId)
      || data.find?.((r: { id: string }) => r.id === serviceRequestId)
    expect(found).toBeTruthy()
  })

  test('Request detail returns correct data', async ({ request }) => {
    const resp = await request.get(`/api/requests/${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.description || data.request?.description).toContain('E2E SR test')
  })

  test('Request status is pending', async ({ request }) => {
    const resp = await request.get(`/api/requests/${serviceRequestId}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    const data = await resp.json()
    const status = data.status || data.request?.status
    expect(status).toBe('pending')
  })

  test('Cancel request works', async ({ request }) => {
    const resp = await request.patch(`/api/requests/${serviceRequestId}/cancel`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    // Accept 200 or check response
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(data.success).toBe(true)
    }
  })
})

/**
 * Every check has to pass before the first write. The ServiceRequests stream emails
 * every active garage on INSERT, so a request stored and then refused (the old guest
 * bodywork path) spammed every garage on every retry.
 */
test.describe('Request creation writes nothing until it is valid', () => {
  test('Guest bodywork submit without credentials writes nothing', async ({ playwright }) => {
    const guest = await newGuest(playwright)
    const marker = uniqueMarker('nocreds')
    const resp = await guest.post('/api/service-request/', {
      data: { category: 'meriki-vafi', brand: 'Fiat', model: marker, modelYear: '2010', description: marker },
    })
    expect(resp.status()).toBe(400)
    expect(await requestsWithDescription(marker)).toHaveLength(0)
    expect(await vehiclesWithModel(marker)).toHaveLength(0)
  })

  test('Guest with a short password or no consent writes nothing', async ({ playwright }) => {
    const guest = await newGuest(playwright)
    const marker = uniqueMarker('weak')
    const base = mechanicalRequest({ description: marker, model: marker, email: `e2e-b-weak-${Date.now()}@test.com` })
    const short = await guest.post('/api/service-request/', { data: { ...base, password: 'short', acceptedTerms: true } })
    expect(short.status()).toBe(400)
    const noConsent = await guest.post('/api/service-request/', { data: { ...base, password: 'LongEnough123' } })
    expect(noConsent.status()).toBe(400)
    expect(await requestsWithDescription(marker)).toHaveLength(0)
    expect(await vehiclesWithModel(marker)).toHaveLength(0)
  })

  test('A taken email gets 409 and nothing is written', async ({ playwright }) => {
    const owner = await freshClient(playwright, 'taken')
    const guest = await newGuest(playwright)
    const marker = uniqueMarker('taken')
    const resp = await guest.post('/api/service-request/', {
      data: mechanicalRequest({
        description: marker,
        model: marker,
        // Mixed case and padding: the check must compare what login compares.
        email: `  ${owner.email.toUpperCase()} `,
        password: 'AnotherPass123',
        acceptedTerms: true,
      }),
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('EMAIL_EXISTS')
    expect(await requestsWithDescription(marker)).toHaveLength(0)
    expect(await vehiclesWithModel(marker)).toHaveLength(0)
    expect(await clientsWithEmail(owner.email)).toHaveLength(1)
  })

  test('Guest registration creates one signed-in account', async ({ playwright }) => {
    const guest = await newGuest(playwright)
    const email = `e2e-b-signup-${Date.now()}@test.com`
    const marker = uniqueMarker('signup')
    const resp = await guest.post('/api/service-request/', {
      data: mechanicalRequest({ description: marker, email, password: 'GoodPass123', acceptedTerms: true }),
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.isNewAccount).toBe(true)
    expect(resp.headers()['set-cookie'] || '').toContain('auth-token=')
    const accounts = await clientsWithEmail(email)
    expect(accounts).toHaveLength(1)
    // Garages see the first name while they quote; the email's local part is not one.
    expect(accounts[0].firstName).toBe('Επισκέπτης')
    expect(String(accounts[0].firstName)).not.toContain('signup')
    expect(await requestsForClient(data.clientId)).toHaveLength(1)
    // The response no longer claims SMS notifications that never happened.
    expect(data.notificationsSent).toBeUndefined()
  })

  test('Guest registration keeps the optional mobile as E.164 and refuses a bad one', async ({ playwright }) => {
    const guest = await newGuest(playwright)
    const email = `e2e-b-phone-${Date.now()}@test.com`

    const bad = await guest.post('/api/service-request/', {
      data: mechanicalRequest({ email, password: 'GoodPass123', acceptedTerms: true, phoneNumber: '+30 21012' }),
    })
    expect(bad.status()).toBe(400)
    expect(await clientsWithEmail(email)).toHaveLength(0)

    const ok = await guest.post('/api/service-request/', {
      data: mechanicalRequest({ email, password: 'GoodPass123', acceptedTerms: true, phoneNumber: '+306912345678' }),
    })
    expect(ok.status()).toBe(200)
    const [account] = await clientsWithEmail(email)
    expect(account.phoneNumber).toBe('+306912345678')
  })
})

test('The request form offers an optional mobile with a country picker', async ({ page }) => {
  await page.route('**/api/upload-photos/', (route) =>
    route.fulfill({ json: { success: true, photoData: [{}], rejected: [] } })
  )
  const marker = uniqueMarker('phone-ui')
  await seedDraft(page, {
    category: 'meriki-vafi', description: marker, brand: 'Fiat', model: 'Punto', modelYear: '2015', owner: 'guest',
  }, '/car-specifications/')

  const email = `e2e-b-phone-ui-${Date.now()}@test.com`
  await page.locator('#guest-email').fill(email)
  await expect(page.getByText('Θέλεις πιο άμεση επικοινωνία;')).toBeVisible()
  await expect(page.getByText('+30', { exact: true })).toBeVisible()

  // Another country, picked from the full list.
  await page.getByLabel('Χώρα κινητού').selectOption('CY')
  await expect(page.getByText('+357', { exact: true })).toBeVisible()
  await page.getByLabel('Χώρα κινητού').selectOption('GR')

  await page.locator('#guest-password').fill('GoodPass123')
  await page.locator('#guest-password-confirm').fill('GoodPass123')
  await page.getByRole('checkbox').check()
  await page.locator('#damage-photos').setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: TINY_PNG })

  // A landline is not a mobile: the form says so and will not send.
  await page.locator('#guest-phone').fill('2101234567')
  await expect(page.getByText('Το κινητό ξεκινά από 69 και έχει 10 ψηφία')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })).toBeDisabled()

  await page.locator('#guest-phone').fill('691 234 5678')
  await page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' }).click()
  await page.waitForURL('**/requests/client-**')
  const [account] = await clientsWithEmail(email)
  expect(account.phoneNumber).toBe('+306912345678')
})

test.describe('Request creation stores the right thing', () => {
  test('The same submission id stores one request, even fired in parallel', async ({ playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'idem')
    const marker = uniqueMarker('idem')
    const body = mechanicalRequest({ description: marker, submissionId: crypto.randomUUID() })
    const responses = await Promise.all([
      api.post('/api/service-request/', { data: body }),
      api.post('/api/service-request/', { data: body }),
      api.post('/api/service-request/', { data: body }),
    ])
    const ok = responses.filter((r) => r.status() === 200)
    expect(ok.length).toBeGreaterThanOrEqual(1)
    for (const r of responses) expect([200, 409]).toContain(r.status())
    const ids = new Set(await Promise.all(ok.map(async (r) => (await r.json()).serviceRequestId)))
    expect(ids.size).toBe(1)
    const stored = (await requestsForClient(clientId)).filter((r) => r.description === marker)
    expect(stored).toHaveLength(1)
  })

  test('Turbo is stored, read back, and counts as a different car', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'turbo')
    const first = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ isTurbo: true }),
    })).json()
    expect(first.success).toBe(true)
    expect((await getRow(TABLES.Vehicles, first.vehicleId))?.isTurbo).toBe(true)

    const detail = await (await api.get(`/api/requests/${first.serviceRequestId}/`)).json()
    expect(detail.request.vehicle.isTurbo).toBe(true)

    // Same saved car, turbo flipped: not the same car any more.
    const changed = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ isTurbo: false, originalVehicleId: first.vehicleId }),
    })).json()
    expect(changed.vehicleId).not.toBe(first.vehicleId)

    // Same saved car, nothing changed: reused.
    const same = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ isTurbo: true, originalVehicleId: first.vehicleId }),
    })).json()
    expect(same.vehicleId).toBe(first.vehicleId)
  })

  test('Client-supplied photos, photo keys and estimate are ignored', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'junk')
    const resp = await api.post('/api/service-request/', {
      data: mechanicalRequest({
        photos: [{ name: 'a.jpg', size: 1, type: 'image/jpeg' }],
        photoUrls: ['Requests/someone-else/license/secret.jpg'],
        estimatedCost: 1,
      }),
    })
    const data = await resp.json()
    const row = await getRow(TABLES.ServiceRequests, data.serviceRequestId)
    expect(row?.photos).toEqual([])
    expect(row?.photoUrls).toEqual([])

    // The stored estimate is the server's own lookup on this car.
    const estimate = await (await api.post('/api/price-estimation/', { data: mechanicalRequest() })).json()
    expect(estimate.estimation?.estimatedCost).toBeGreaterThan(1)
    expect(row?.estimatedCost).toBe(estimate.estimation.estimatedCost)
  })

  test("A request cannot borrow another client's vehicle", async ({ playwright }) => {
    const owner = await freshClient(playwright, 'owner')
    const theirs = await (await owner.api.post('/api/service-request/', {
      data: mechanicalRequest({ vinNumber: 'VF3OWNER000000001' }),
    })).json()

    const other = await freshClient(playwright, 'borrower')
    const mine = await (await other.api.post('/api/service-request/', {
      data: mechanicalRequest({ vinNumber: 'VF3OWNER000000001', originalVehicleId: theirs.vehicleId }),
    })).json()
    expect(mine.success).toBe(true)
    expect(mine.vehicleId).not.toBe(theirs.vehicleId)
    expect((await getRow(TABLES.Vehicles, mine.vehicleId))?.clientId).toBe(other.clientId)
  })

  test('Editing a saved car keeps its άδεια photo on the new row', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'clone')
    const first = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()
    const key = `Requests/${first.vehicleId}/license/e2e.jpg`
    await setLicensePhotoKey(first.vehicleId, key)

    const edited = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ originalVehicleId: first.vehicleId, vinNumber: 'VF3EDITED00000001' }),
    })).json()
    expect(edited.vehicleId).not.toBe(first.vehicleId)
    const copy = await getRow(TABLES.Vehicles, edited.vehicleId)
    expect(copy?.licensePhotoUrl).toBe(key)
    expect(copy?.vinNumber).toBe('VF3EDITED00000001')
  })

  test('A saved car switched to another model keeps none of its plate, numbers or άδεια', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'othermodel')
    const first = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ vinNumber: 'VF3PLATE000000001', engineNumber: 'KFVPLATE1' }),
    })).json()
    await setVehicleFields(first.vehicleId, {
      licensePlate: 'ΙΚΧ-1234',
      color: 'Κόκκινο',
      nickname: 'Το κόκκινο',
      licensePhotoUrl: `Requests/${first.vehicleId}/license/e2e.jpg`,
    })

    // Another model, nothing identifying in the body — as the form sends it.
    const other = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ model: '307', originalVehicleId: first.vehicleId }),
    })).json()
    expect(other.vehicleId).not.toBe(first.vehicleId)
    const row = await getRow(TABLES.Vehicles, other.vehicleId)
    expect(row?.model).toBe('307')
    for (const field of ['licensePlate', 'color', 'nickname', 'licensePhotoUrl', 'vinNumber', 'engineNumber']) {
      expect(row?.[field], field).toBeUndefined()
    }

    // Same model, another year: still that car, so it keeps them.
    const edited = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ modelYear: '2007', originalVehicleId: first.vehicleId }),
    })).json()
    const copy = await getRow(TABLES.Vehicles, edited.vehicleId)
    expect(copy?.licensePlate).toBe('ΙΚΧ-1234')
    expect(copy?.nickname).toBe('Το κόκκινο')
    expect(copy?.licensePhotoUrl).toBe(`Requests/${first.vehicleId}/license/e2e.jpg`)
  })

  test('A saved car with a legacy "1600cc" can still be used for bodywork', async ({ playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'legacycc')
    const first = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()
    await setVehicleFields(first.vehicleId, { engineCC: '1600cc' })

    // The saved-cars list hands it out as digits, so step 1 can use it.
    const listed = await (await api.get(`/api/clients/${clientId}/vehicles/`)).json()
    expect(listed.vehicles.find((v: { id: string }) => v.id === first.vehicleId)?.engineCC).toBe('1600')

    // A draft from before still carries the raw value; the bodywork form never shows it.
    const marker = uniqueMarker('legacycc')
    const bodywork = await api.post('/api/service-request/', {
      data: {
        category: 'meriki-vafi',
        description: marker,
        brand: 'Peugeot',
        model: '206',
        modelYear: '2006',
        engineCC: '1600cc',
        fuelType: 'petrol',
        originalVehicleId: first.vehicleId,
      },
    })
    expect(bodywork.status()).toBe(200)
    expect((await bodywork.json()).vehicleId).toBe(first.vehicleId)
    expect(await requestsWithDescription(marker)).toHaveLength(1)

    // A mechanical request still has to give a real displacement.
    const bad = await api.post('/api/service-request/', { data: mechanicalRequest({ engineCC: 'πολλά' }) })
    expect(bad.status()).toBe(400)
  })

  test('A session whose account is being merged cannot file a request', async ({ playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'merging')
    await setClientFields(clientId, { mergingInto: 'client-e2e-merge-target', mergeClaimedAt: new Date().toISOString() })
    const marker = uniqueMarker('merging')
    const resp = await api.post('/api/service-request/', { data: mechanicalRequest({ description: marker }) })
    expect(resp.status()).toBe(409)
    const body = await resp.json()
    expect(body.code).toBe('MERGE_IN_PROGRESS')
    expect(body.error).toMatch(/μεταφέρονται/)
    expect(await requestsWithDescription(marker)).toHaveLength(0)

    // Once the merge is done the session names a tombstone: signed out.
    await setClientFields(clientId, { mergedInto: 'client-e2e-merge-target' })
    const after = await api.post('/api/service-request/', { data: mechanicalRequest({ description: marker }) })
    expect(after.status()).toBe(401)
    expect(await requestsWithDescription(marker)).toHaveLength(0)
  })

  test('A bodywork request on a saved car reuses it without engine details', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'bwsaved')
    const first = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()
    const bodywork = await api.post('/api/service-request/', {
      data: {
        category: 'meriki-vafi',
        brand: 'Peugeot',
        model: '206',
        modelYear: '2006',
        originalVehicleId: first.vehicleId,
      },
    })
    expect(bodywork.status()).toBe(200)
    expect((await bodywork.json()).vehicleId).toBe(first.vehicleId)
  })
})

test.describe('Request funnel in the browser', () => {
  test('Double-clicking submit files exactly one request', async ({ page, playwright }) => {
    const { clientId } = await freshClient(playwright, 'dblclick', page)
    const marker = uniqueMarker('dblclick')
    await seedDraft(page, {
      ...mechanicalRequest({ description: marker }),
      vinNumber: 'VF3DOUBLE00000001',
      engineNumber: 'KFV12345',
      owner: clientId,
    }, '/car-specifications/')

    const submit = page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })
    await expect(submit).toBeEnabled()
    // Three synchronous clicks, before React can re-render the button disabled —
    // only the in-flight guards can stop the second and third.
    await submit.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); b.click() })

    await page.waitForURL(`**/requests/${clientId}/**`)
    const stored = (await requestsForClient(clientId)).filter((r) => r.description === marker)
    expect(stored).toHaveLength(1)
    // The draft is gone, so the next request starts clean and Back can't resubmit it.
    expect(await readDraft(page)).toBeNull()

    await page.goBack()
    await page.waitForURL('**/car-details/**')
  })

  test('A guest can send a bodywork request, signing up on step 2', async ({ page }) => {
    const marker = uniqueMarker('bwguest')
    const email = `e2e-b-bwguest-${Date.now()}@test.com`
    // The funnel keys a visitor by IP + browser + day, and every test shares the IP:
    // a browser of its own keeps this visit apart from the rest of the suite.
    await page.setExtraHTTPHeaders({ 'User-Agent': `E2E funnel ${marker}` })
    // Photo storage is S3; this spec stays off AWS and checks only that the form
    // hands the photos to the endpoint.
    let uploadedFiles = 0
    await page.route('**/api/upload-photos/', async (route) => {
      uploadedFiles = (route.request().postData() || '').split('name="files"').length - 1
      await route.fulfill({ json: { success: true, photoData: [{}], rejected: [] } })
    })

    await seedDraft(page, {
      category: 'meriki-vafi',
      description: marker,
      brand: 'Fiat',
      model: 'Punto',
      modelYear: '1997',
    }, '/car-details/')

    // Step 1 restores the draft rather than wiping it.
    await expect(page.getByPlaceholder('2020')).toHaveValue('1997')
    await page.getByRole('button', { name: 'ΣΥΝΕΧΕΙΑ' }).click()
    await page.waitForURL('**/car-specifications/**')
    await expect(page.getByRole('heading', { name: 'Φωτογραφίες Ζημιάς' })).toBeVisible()

    // The estimate is shown for bodywork too.
    const estimate = await (await page.request.post('/api/price-estimation/', {
      data: { category: 'meriki-vafi', brand: 'Fiat', model: 'Punto', modelYear: '1997' },
    })).json()
    expect(estimate.estimation).not.toBeNull()
    await expect(page.getByText(`${estimate.estimation.estimatedCost}€`)).toBeVisible()

    await page.locator('#guest-email').fill(email)
    await page.locator('#guest-password').fill('GoodPass123')
    await page.locator('#guest-password-confirm').fill('GoodPass123')
    await page.getByRole('checkbox').check()
    await page.locator('#damage-photos').setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: TINY_PNG })

    await page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' }).click()
    await page.waitForURL('**/requests/client-**')

    const [account] = await clientsWithEmail(email)
    expect(account).toBeTruthy()
    const stored = await requestsForClient(account.id as string)
    expect(stored).toHaveLength(1)
    expect(stored[0].category).toBe('meriki-vafi')
    expect(stored[0].description).toBe(marker)
    expect(stored[0].estimatedCost).toBe(estimate.estimation.estimatedCost)
    expect(uploadedFiles).toBe(1)

    // The admin funnel follows this signed-out visitor through every step by a
    // visitor key the server derives — there was no clientId until the very last
    // one, and nothing is stored in the browser to count it by.
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => /visit/i.test(k)))).toEqual([])
    const visitor = await visitorOfRequest(stored[0].id as string)
    expect(visitor).toMatch(/^v_[0-9a-f]{24}$/)
    const steps = await eventsOfVisitor(visitor!)
    expect(steps).toEqual(expect.arrayContaining([
      'visit_started', 'car_details_started', 'car_details_completed', 'car_specs_started', 'service_request_submitted',
    ]))
    expect(steps.filter((s) => s === 'service_request_submitted')).toHaveLength(1)

    // …and so the admin funnel counts the visit at every step, each bar within the last.
    const adminCookie = await loginAdmin(page.request)
    const today = new Date().toISOString().slice(0, 10)
    const funnel = await (await page.request.get(`/api/admin/funnel/client/?from=${today}&to=${today}`, {
      headers: { Cookie: adminCookie },
    })).json()
    const counts: number[] = funnel.steps.map((s: { count: number }) => s.count)
    expect(funnel.steps.map((s: { key: string }) => s.key)).toEqual([
      'visit_started', 'car_details_started', 'car_details_completed', 'car_specs_started', 'service_request_submitted',
    ])
    expect(counts.at(-1)).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
  })

  test('A signed-in garage is told the request makes it a client account', async ({ page, request }) => {
    // Submitting registers a client and its cookie replaces the garage's — it
    // used to happen with no word of warning.
    const { token } = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    await setAuthCookie(page, token)
    await seedDraft(page, { ...mechanicalRequest(), owner: 'guest' }, '/car-specifications/')
    await expect(page.getByText('Με την αποστολή θα δημιουργηθεί λογαριασμός πελάτη')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#guest-email')).toBeVisible()
  })

  test('Without the άδεια, the form says both numbers are needed', async ({ page }) => {
    await seedDraft(page, { ...mechanicalRequest(), owner: 'guest' }, '/car-specifications/')
    await page.getByRole('button', { name: 'Αριθμός Κινητήρα' }).click()
    await expect(page.getByText('Συμπληρώστε τον αριθμό κινητήρα')).toBeVisible()
    await page.getByRole('textbox', { name: 'Αριθμός κινητήρα' }).fill('KFV12345')
    // Engine number alone is not enough — the button stays off until the VIN is in.
    await page.locator('#guest-email').fill(`e2e-vin-${Date.now()}@test.com`)
    await page.locator('#guest-password').fill('GoodPass123')
    await page.locator('#guest-password-confirm').fill('GoodPass123')
    await page.getByRole('checkbox').check()
    const submit = page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })
    await expect(submit).toBeDisabled()
    await page.getByRole('textbox', { name: 'Αριθμός πλαισίου' }).fill('VF3VINHINT0000001')
    await expect(submit).toBeEnabled()
  })

  test('A taken email that slipped past the live check offers the login', async ({ page, playwright }) => {
    const owner = await freshClient(playwright, 'slipped')
    const marker = uniqueMarker('slipped')
    // The live check fails open on 429/500; the submit must still catch it.
    await page.route('**/api/auth/check-email/', (route) =>
      route.fulfill({ status: 429, json: { error: 'Πάρα πολλές προσπάθειες.' } })
    )
    await seedDraft(page, {
      ...mechanicalRequest({ description: marker }),
      vinNumber: 'VF3SLIPPED0000001',
      engineNumber: 'KFV99999',
      owner: 'guest',
    }, '/car-specifications/')

    await page.locator('#guest-email').fill(owner.email)
    await page.locator('#guest-password').fill('GoodPass123')
    await page.locator('#guest-password-confirm').fill('GoodPass123')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' }).click()

    // The login modal opens on the 409, and the form switches to "log in instead".
    await expect(page.getByText('Καλώς ήρθατε πίσω')).toBeVisible()
    await expect(page.getByText('Αυτό το email χρησιμοποιείται ήδη')).toBeVisible()
    expect(await requestsWithDescription(marker)).toHaveLength(0)
  })

  test('"Νέο Όχημα" drops the previous car\'s numbers', async ({ page, playwright }) => {
    const { api } = await freshClient(playwright, 'newcar', page)
    await api.post('/api/service-request/', {
      data: mechanicalRequest({ vinNumber: 'VF3SAVED000000001', engineNumber: 'KFVSAVED1' }),
    })
    await seedDraft(page, { category: 'symplektis' }, '/car-details/')

    const picker = page.locator('select')
    await expect(picker.locator('option')).toHaveCount(2)
    await picker.selectOption({ index: 1 })
    await expect.poll(async () => (await readDraft(page))?.vinNumber).toBe('VF3SAVED000000001')

    await picker.selectOption({ index: 0 })
    await expect.poll(async () => (await readDraft(page))?.vinNumber).toBe('')
    const draft = await readDraft(page)
    expect(draft?.engineNumber).toBe('')
    expect(draft?.originalVehicleId).toBeUndefined()
    expect(draft?.originalVehicleLicensePhotoUrl).toBeUndefined()
  })

  test('Another model on a saved car drops its link, numbers and άδεια', async ({ page, playwright }) => {
    const { api } = await freshClient(playwright, 'swapmodel', page)
    await api.post('/api/service-request/', {
      data: mechanicalRequest({ vinNumber: 'VF3SWAP0000000001', engineNumber: 'KFVSWAP1' }),
    })
    await seedDraft(page, { category: 'symplektis' }, '/car-details/')

    const picker = page.locator('select')
    await expect(picker.locator('option')).toHaveCount(2)
    await picker.selectOption({ index: 1 })
    await expect.poll(async () => (await readDraft(page))?.vinNumber).toBe('VF3SWAP0000000001')

    // Peugeot 206 → 208: a different car.
    await page.getByText('206', { exact: true }).click()
    await page.getByText('208', { exact: true }).click()
    await expect.poll(async () => (await readDraft(page))?.originalVehicleId).toBeUndefined()
    const draft = await readDraft(page)
    expect(draft?.model).toBe('208')
    expect(draft?.vinNumber).toBe('')
    expect(draft?.engineNumber).toBe('')
    expect(draft?.originalVehicleLicensePhotoUrl).toBeUndefined()
    await expect(picker).toHaveValue('')
  })

  test("A draft someone else left keeps the job but not their car's numbers or άδεια", async ({ page, playwright, browser }) => {
    const previous = await freshClient(playwright, 'prevowner')
    const { clientId } = await freshClient(playwright, 'nextowner', page)
    const marker = uniqueMarker('leftover')
    const leftover = {
      ...mechanicalRequest({ description: marker }),
      owner: previous.clientId,
      originalVehicleId: 'vehicle-e2e-not-yours',
      originalVehicleLicensePhotoUrl: 'https://example.com/their-licence.jpg',
      vinNumber: 'VF3THEIRS00000001',
      engineNumber: 'KFVTHEIRS',
      submissionId: crypto.randomUUID(),
    }

    // Straight to step 2, the way browser history gets there.
    await seedDraft(page, leftover, '/car-specifications/')
    await expect(page.getByRole('heading', { name: 'Τεχνικά Στοιχεία' })).toBeVisible()
    await expect.poll(async () => (await readDraft(page))?.owner).toBe(clientId)
    const draft = await readDraft(page)
    expect(draft?.description).toBe(marker)
    expect(draft?.vinNumber).toBe('')
    expect(draft?.engineNumber).toBe('')
    expect(draft?.originalVehicleId).toBeUndefined()
    expect(draft?.originalVehicleLicensePhotoUrl).toBeUndefined()
    expect(draft?.submissionId).toBeUndefined()
    // Their άδεια used to count as given, and the submit went out on it.
    await expect(page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })).toBeDisabled()

    // A visitor who is not signed in gets the same treatment on step 1.
    const guestContext = await browser.newContext({ baseURL: 'http://localhost:3000' })
    const guestPage = await guestContext.newPage()
    await seedDraft(guestPage, leftover, '/car-details/')
    // Claimed for this tab's own anonymous visitor (`guest:<id>`), not the leftover's owner.
    await expect.poll(async () => String((await readDraft(guestPage))?.owner ?? '')).toMatch(/^guest:/)
    const guestDraft = await readDraft(guestPage)
    expect(guestDraft?.vinNumber).toBe('')
    expect(guestDraft?.originalVehicleId).toBeUndefined()
    expect(guestDraft?.originalVehicleLicensePhotoUrl).toBeUndefined()
    await guestContext.close()
  })

  test("Another anonymous visitor's draft keeps the job but not the VIN they typed", async ({ page }) => {
    // Left by a guest in another tab or an earlier visit: same browser, different person.
    await seedDraft(page, {
      ...mechanicalRequest({ description: uniqueMarker('other-guest') }),
      owner: 'guest:someone-else',
      vinNumber: 'VF3OTHERGUEST0001',
      engineNumber: 'KFVOTHER1',
    }, '/car-details/')
    await expect.poll(async () => String((await readDraft(page))?.owner ?? '')).toMatch(/^guest:(?!someone-else)/)
    const draft = await readDraft(page)
    expect(draft?.vinNumber).toBe('')
    expect(draft?.engineNumber).toBe('')
  })

  test('A "Στείλε αίτημα" link starts a new request instead of resuming the last one', async ({ page }) => {
    await seedDraft(page, {
      ...mechanicalRequest({ description: uniqueMarker('resumed') }),
      owner: 'guest',
      vinNumber: 'VF3OLDDRAFT000001',
    }, '/location/peiraias/')

    await page.getByRole('link', { name: 'Στείλε αίτημα' }).first().click()
    await page.waitForURL('**/car-details/**')
    await expect(page.getByText('Διάλεξε πρώτα τι χρειάζεται το αυτοκίνητό σου')).toBeVisible()
    // The flag is spent, so a reload or "Επιστροφή" resumes the new draft.
    expect(page.url()).not.toContain('new=')
    const draft = await readDraft(page)
    expect(draft?.description || '').toBe('')
    expect(draft?.category || '').toBe('')
    expect(draft?.vinNumber || '').toBe('')
  })

  test('Without crypto.randomUUID (iOS before 15.4) the submit still goes through', async ({ page, playwright }) => {
    const { clientId } = await freshClient(playwright, 'nouuid', page)
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true })
    })
    const marker = uniqueMarker('nouuid')
    let sentId = ''
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/service-request/')) {
        sentId = JSON.parse(req.postData() || '{}').submissionId || ''
      }
    })
    await seedDraft(page, {
      ...mechanicalRequest({ description: marker }),
      vinNumber: 'VF3NOUUID00000001',
      engineNumber: 'KFVNOUUID',
      owner: clientId,
    }, '/car-specifications/')

    await page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' }).click()
    await page.waitForURL(`**/requests/${clientId}/**`)
    expect(sentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const stored = (await requestsForClient(clientId)).filter((r) => r.description === marker)
    expect(stored.map((r) => r.id)).toEqual([`sr-${sentId}`])
  })

  test('A resend after a lost answer says it was already sent; an edited one is a new request', async ({ page, playwright }) => {
    const { clientId } = await freshClient(playwright, 'lostanswer', page)
    const marker = uniqueMarker('lostanswer')
    await seedDraft(page, {
      ...mechanicalRequest({ description: marker }),
      vinNumber: 'VF3LOST000000001',
      engineNumber: 'KFVLOST1',
      owner: clientId,
    }, '/car-specifications/')
    const submit = page.getByRole('button', { name: 'ΑΠΟΣΤΟΛΗ ΑΙΤΗΜΑΤΟΣ' })
    const stored = async () => (await requestsForClient(clientId)).filter((r) => r.description === marker)

    // The server stores it, the answer never reaches the browser.
    const loseAnswer = async () => {
      let handled!: () => void
      const done = new Promise<void>((resolve) => { handled = resolve })
      await page.route('**/api/service-request/', async (route) => {
        await route.fetch()
        await route.abort('failed')
        handled()
      }, { times: 1 })
      await submit.click()
      await done
      await expect(submit).toBeEnabled()
    }

    await loseAnswer()
    expect(await stored()).toHaveLength(1)

    // An edit after that is a request of its own, not a silent no-op.
    await page.getByLabel('Αριθμός κινητήρα').fill('KFVLOST2')
    await loseAnswer()
    expect(await stored()).toHaveLength(2)

    // The same body again: recognised, and said so.
    await submit.click()
    await page.waitForURL(`**/requests/${clientId}/**`)
    await expect(page.getByText('Το αίτημα είχε ήδη σταλεί')).toBeVisible()
    expect(await stored()).toHaveLength(2)
  })

  test('Back from step 2 keeps what step 1 had', async ({ page }) => {
    await seedDraft(page, mechanicalRequest({ description: uniqueMarker('back') }), '/car-details/')
    await expect(page.getByPlaceholder('1600')).toHaveValue('1400')
    await page.getByRole('button', { name: 'ΣΥΝΕΧΕΙΑ' }).click()
    await page.waitForURL('**/car-specifications/**')
    await page.getByRole('button', { name: 'Επιστροφή' }).click()
    await page.waitForURL('**/car-details/**')
    await expect(page.getByPlaceholder('2020')).toHaveValue('2006')
    await expect(page.getByPlaceholder('1600')).toHaveValue('1400')
  })

  test('With no category, the category is asked for first', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('nextservice-form-data'))

    await page.goto('/car-specifications/')
    await page.waitForURL('**/car-details/**')
    await expect(page.getByText('Τι χρειάζεται το αυτοκίνητό σου;')).toBeVisible()

    await page.getByRole('button', { name: 'Ιμάντας' }).click()
    await expect(page.getByText('Τι χρειάζεται το αυτοκίνητό σου;')).toBeHidden()
    await expect(page.getByText('Ιμάντας').first()).toBeVisible()
    expect((await readDraft(page))?.category).toBe('imantas')
  })

  test('Request details open by id, past the first page of requests', async ({ page, playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'details', page)
    const marker = uniqueMarker('oldest')
    const oldest = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ description: marker }),
    })).json()
    // Twenty newer ones push it off the list's first page.
    for (let i = 0; i < 20; i++) {
      await api.post('/api/service-request/', { data: mechanicalRequest({ description: `E2E B filler ${i}` }) })
    }

    await page.goto(`/requests/${clientId}/details/${oldest.serviceRequestId}/`)
    // Generous: the first visit compiles the route in dev.
    await expect(page.getByText(marker)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Το αίτημα δεν βρέθηκε')).toHaveCount(0)
  })

  test('The details page goes back to the requests list, even opened from an email', async ({ page, playwright, context }) => {
    const { api, clientId } = await freshClient(playwright, 'detailsback', page)
    const marker = uniqueMarker('detailsback')
    const created = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ description: marker }),
    })).json()

    // A new tab with nothing behind it, as a link in an email opens.
    const tab = await context.newPage()
    await tab.goto(`/requests/${clientId}/details/${created.serviceRequestId}/`)
    await expect(tab.getByText(marker)).toBeVisible({ timeout: 30_000 })
    await tab.getByRole('button', { name: 'Πίσω στα αιτήματα' }).click()
    await tab.waitForURL(`**/requests/${clientId}/`)
  })
})
