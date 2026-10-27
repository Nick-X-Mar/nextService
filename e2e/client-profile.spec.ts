import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'
import { freshClient, getRow, mechanicalRequest, readDraft, setLicensePhotoKey, setVehicleFields } from './b-helpers'

const CLIENT_EMAIL = `e2e-profile-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let clientToken: string

test.describe.serial('Client Profile & Vehicles', () => {

  test('Setup: register client', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = login.token
  })

  test('GET client profile', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/clients/${clientId}`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.client.email).toBe(CLIENT_EMAIL.toLowerCase())
  })

  test('PUT client profile update', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.put(`/api/clients/${clientId}`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        email: CLIENT_EMAIL,
        firstName: 'Γιώργος',
        lastName: 'Τεστ',
        phoneNumber: '6971234567',
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.client.firstName).toBe('Γιώργος')
    expect(data.client.lastName).toBe('Τεστ')
  })

  test('Cannot update another client profile', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.put('/api/clients/client-fake-id', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { email: 'hacker@test.com', firstName: 'Hacker' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(403)
  })

  test('Create service request to get a vehicle', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E profile test',
        brand: 'Opel',
        model: 'Corsa',
        modelYear: '2016',
        engineCC: '1400',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
        vinNumber: 'W0L000000Y1234567',
      },
    })
    expect(resp.status()).toBe(200)
  })

  test('GET client vehicles', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.get(`/api/clients/${clientId}/vehicles`, {
      headers: { Cookie: `auth-token=${login.token}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const vehicles = data.vehicles || data
    expect(vehicles.length).toBeGreaterThanOrEqual(1)
    const opel = vehicles.find((v: { brand: string }) => v.brand === 'Opel')
    expect(opel).toBeTruthy()
    expect(opel.model).toBe('Corsa')
  })
})

/**
 * The άδεια κυκλοφορίας photo. The form used to send only the file *name*, so the
 * document never left the browser and neither side ever saw it — these tests pin the
 * whole path: upload against the vehicle, then read it back as a presigned URL from
 * both the request detail and the requests list the details screen actually uses.
 */
test.describe.serial('Vehicle license photo', () => {
  const email = `e2e-license-${Date.now()}@test.com`
  const password = 'TestPass123'
  // Smallest valid PNG — the endpoint validates type and size, not content.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )

  let token: string
  let cId: string
  let srId: string
  let vehicleId: string
  let uploaded = false

  test('Setup: request creates the vehicle', async ({ request }) => {
    const reg = await registerClient(request, email, password)
    cId = reg.client.id
    token = (await loginViaAPI(request, email, password, 'client')).token

    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        clientId: cId,
        category: 'imantas',
        description: 'E2E license photo',
        brand: 'Citroen',
        model: 'C3',
        modelYear: '2017',
        engineCC: '1200',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    const sr = await srResp.json()
    srId = sr.serviceRequestId
    vehicleId = sr.vehicleId
    expect(vehicleId).toBeTruthy()
  })

  test('Photo uploads against the vehicle', async ({ request }) => {
    // This one really writes to the S3 bucket, so it only runs when asked to
    // (E2E_S3=1). Without it the vehicle gets a key directly, which is all the
    // presigning tests below need.
    if (process.env.E2E_S3 === '1') {
      const resp = await request.post(`/api/vehicles/${vehicleId}/license-photo`, {
        headers: { Cookie: `auth-token=${token}` },
        multipart: { file: { name: 'adeia.png', mimeType: 'image/png', buffer: PNG } },
      })
      expect(resp.status()).toBe(200)
      const data = await resp.json()
      expect(data.key).toContain(vehicleId)
    } else {
      await setLicensePhotoKey(vehicleId, `Requests/${vehicleId}/license/e2e.png`)
    }
    uploaded = true
  })

  test('A file that is not a photo is refused before anything is stored', async ({ request }) => {
    const resp = await request.post(`/api/vehicles/${vehicleId}/license-photo/`, {
      headers: { Cookie: `auth-token=${token}` },
      multipart: { file: { name: 'adeia.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') } },
    })
    expect(resp.status()).toBe(400)
  })

  test('Someone else cannot upload against this vehicle', async ({ request }) => {
    const resp = await request.post(`/api/vehicles/${vehicleId}/license-photo`, {
      multipart: { file: { name: 'adeia.png', mimeType: 'image/png', buffer: PNG } },
    })
    expect([401, 403]).toContain(resp.status())
  })

  test('Request detail hands back a presigned URL', async ({ request }) => {
    test.skip(!uploaded, 'Nothing was uploaded')
    const resp = await request.get(`/api/requests/${srId}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    const data = await resp.json()
    expect(data.request.vehicle.licensePhotoUrl).toContain('X-Amz-Signature')
  })

  test('Requests list carries it too — that is what the details screen reads', async ({ request }) => {
    test.skip(!uploaded, 'Nothing was uploaded')
    const resp = await request.get(`/api/requests?clientId=${cId}`, {
      headers: { Cookie: `auth-token=${token}` },
    })
    const data = await resp.json()
    const ours = (data.requests || []).find((r: { id: string }) => r.id === srId)
    expect(ours?.vehicle?.licensePhotoUrl).toContain('X-Amz-Signature')
  })
})

test.describe('Saved vehicle edits', () => {
  test('Plate, colour and nickname are saved, not silently dropped', async ({ playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'vedit')
    const sr = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()

    const resp = await api.patch(`/api/vehicles/${sr.vehicleId}/`, {
      data: { licensePlate: 'ikx-1234', color: 'Μπλε', nickname: 'Το μπλε' },
    })
    expect(resp.status()).toBe(200)
    const patched = (await resp.json()).vehicle
    expect(patched.licensePlate).toBe('IKX-1234')
    expect(patched.passwordHash).toBeUndefined()

    const list = await (await api.get(`/api/clients/${clientId}/vehicles/`)).json()
    const saved = list.vehicles.find((v: { id: string }) => v.id === sr.vehicleId)
    expect(saved).toMatchObject({ licensePlate: 'IKX-1234', color: 'Μπλε', nickname: 'Το μπλε' })
  })

  test('Invalid edits are refused and change nothing', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'vbad')
    const sr = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()

    for (const bad of [{ modelYear: '20' }, { brand: '' }, { fuelType: 'rocket' }, { licensePlate: 'X'.repeat(30) }]) {
      const resp = await api.patch(`/api/vehicles/${sr.vehicleId}/`, { data: bad })
      expect(resp.status()).toBe(400)
    }
    const row = await getRow('Vehicles', sr.vehicleId)
    expect(row).toMatchObject({ brand: 'Peugeot', modelYear: '2006', fuelType: 'petrol' })
  })

  test('A car saved with a legacy engine value can still be edited', async ({ playwright }) => {
    const { api } = await freshClient(playwright, 'vlegacy')
    const sr = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()

    // Not a number at all: sent back unchanged with the rest of the form, it is not an
    // edit and must not fail the save of the field next to it.
    await setVehicleFields(sr.vehicleId, { engineCC: '1.6 TDI' })
    const resp = await api.patch(`/api/vehicles/${sr.vehicleId}/`, {
      data: { engineCC: '1.6 TDI', nickname: 'Το παλιό', modelYear: '2006' },
    })
    expect(resp.status()).toBe(200)
    expect(await getRow('Vehicles', sr.vehicleId)).toMatchObject({ engineCC: '1.6 TDI', nickname: 'Το παλιό' })

    // Litres typed in are stored as cc; anything else that is new still has to be valid.
    const litres = await api.patch(`/api/vehicles/${sr.vehicleId}/`, { data: { engineCC: '1,6' } })
    expect(litres.status()).toBe(200)
    expect((await litres.json()).vehicle.engineCC).toBe('1600')
    const junk = await api.patch(`/api/vehicles/${sr.vehicleId}/`, { data: { engineCC: 'πολλά' } })
    expect(junk.status()).toBe(400)
    expect((await getRow('Vehicles', sr.vehicleId))?.engineCC).toBe('1600')
  })

  test('Another client cannot edit the vehicle', async ({ playwright }) => {
    const owner = await freshClient(playwright, 'vowner')
    const sr = await (await owner.api.post('/api/service-request/', { data: mechanicalRequest() })).json()
    const other = await freshClient(playwright, 'vother')
    const resp = await other.api.patch(`/api/vehicles/${sr.vehicleId}/`, { data: { nickname: 'mine now' } })
    expect(resp.status()).toBe(403)
  })

  test('The άδεια comes back as a presigned URL, never a raw S3 key', async ({ playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'vpresign')
    const sr = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()
    const key = `Requests/${sr.vehicleId}/license/e2e.jpg`
    await setLicensePhotoKey(sr.vehicleId, key)

    const list = await (await api.get(`/api/clients/${clientId}/vehicles/`)).json()
    const listed = list.vehicles.find((v: { id: string }) => v.id === sr.vehicleId)
    expect(listed.licensePhotoUrl).toMatch(/^https:\/\//)
    expect(listed.licensePhotoUrl).toContain('X-Amz-Signature')

    const patched = (await (await api.patch(`/api/vehicles/${sr.vehicleId}/`, { data: { color: 'Λευκό' } })).json()).vehicle
    expect(patched.licensePhotoUrl).toMatch(/^https:\/\//)
    expect(patched.licensePhotoUrl).toContain('X-Amz-Signature')
    // Still the key in the table: presigning happens on the way out only.
    expect((await getRow('Vehicles', sr.vehicleId))?.licensePhotoUrl).toBe(key)
  })
})

test.describe('Profile email edits', () => {
  test('The email is stored the way login looks it up', async ({ playwright }) => {
    const { api, clientId, password } = await freshClient(playwright, 'mixed')
    const typed = `  E2E-B-Mixed-${Date.now()}@Test.COM `
    const resp = await api.put(`/api/clients/${clientId}/`, { data: { email: typed, firstName: 'Μαρία' } })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.client.email).toBe(typed.trim().toLowerCase())
    // The update response used to be the raw row, password hash included.
    expect(data.client.passwordHash).toBeUndefined()

    const login = await loginViaAPI(api, typed.trim(), password, 'client')
    expect(login.status).toBe(200)
  })

  test('An email that belongs to someone else is a 409', async ({ playwright }) => {
    const first = await freshClient(playwright, 'clashA')
    const second = await freshClient(playwright, 'clashB')
    const resp = await second.api.put(`/api/clients/${second.clientId}/`, {
      data: { email: first.email.toUpperCase(), firstName: 'Β' },
    })
    expect(resp.status()).toBe(409)
    expect((await resp.json()).code).toBe('EMAIL_EXISTS')
    expect((await getRow('Clients', second.clientId))?.email).toBe(second.email.toLowerCase())
  })
})

test.describe('Profile in the browser', () => {
  test('An account still on the «Επισκέπτης» placeholder opens the name field empty', async ({ page, playwright }) => {
    // Registered without a name, so the row holds the placeholder. Prefilling it
    // made every such client delete «Επισκέπτης» before typing their name.
    const { clientId } = await freshClient(playwright, 'placeholder', page)
    await page.goto(`/profile/${clientId}/`)
    const section = page.locator('#user-info-section')
    await section.getByRole('button', { name: 'Επεξεργασία' }).click()
    await expect(section.getByRole('textbox', { name: 'Όνομα' })).toHaveValue('')
    await expect(section.getByRole('button', { name: 'Αποθήκευση' })).toBeDisabled()
  })

  test('Vehicle fields keep focus while typing, and the edit persists', async ({ page, playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'focus', page)
    const sr = await (await api.post('/api/service-request/', { data: mechanicalRequest() })).json()

    await page.goto(`/profile/${clientId}/`)
    const section = page.locator('#vehicles-section')
    await section.getByRole('button', { name: 'Επεξεργασία' }).click()
    const plate = section.getByLabel('Πινακίδα')
    await plate.click()
    // Typed key by key: with the field components declared inside render, focus
    // was lost after the first character and this came out as "Ι".
    await page.keyboard.type('ΙΚΧ-4321')
    await expect(plate).toHaveValue('ΙΚΧ-4321')

    await section.getByRole('button', { name: 'Αποθήκευση' }).click()
    await expect(section.getByRole('button', { name: 'Επεξεργασία' })).toBeVisible()
    await expect.poll(async () => (await getRow('Vehicles', sr.vehicleId))?.licensePlate).toBe('ΙΚΧ-4321')
  })

  test('"Νέο Αίτημα" from the profile prefills step 1', async ({ page, playwright }) => {
    const { api, clientId } = await freshClient(playwright, 'prefill', page)
    const sr = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ brand: 'Opel', model: 'Corsa', modelYear: '2016', engineCC: '1200' }),
    })).json()

    await page.goto(`/profile/${clientId}/`)
    // The one on the car itself — the header and sidebar have their own.
    await page.locator('#vehicles-section').getByRole('button', { name: 'Νέο Αίτημα' }).click()
    await page.getByRole('button', { name: 'Ιμάντας' }).click()
    await page.waitForURL('**/car-details/**')

    // car-details used to clear the draft on mount, so this arrived empty.
    await expect(page.getByPlaceholder('2020')).toHaveValue('2016')
    await expect(page.getByPlaceholder('1600')).toHaveValue('1200')
    const draft = await readDraft(page)
    expect(draft?.category).toBe('imantas')
    // Step 1 drops a saved car from a draft that is not the session's own; this one is.
    expect(draft?.owner).toBe(clientId)
    expect(draft?.originalVehicleId).toBe(sr.vehicleId)
  })
})
