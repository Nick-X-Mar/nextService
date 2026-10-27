import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI } from './helpers'
import { PASSWORD, acceptOffer, ageAppointment, completeJob, cookie, loginAdmin, makeOffer, newClient, newGarage, newRequest, postMessage, setClientName } from './E-helpers'
import { freshClient, getRow, mechanicalRequest, setChatMessageFields, setLicensePhotoKey, setRequestFields } from './b-helpers'

const CLIENT_EMAIL = `e2e-gdpr-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string

test.describe.serial('GDPR: Data Export & Account Deletion', () => {

  test('Setup: register client and create data', async ({ request }) => {
    const reg = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = reg.client.id

    // Create a service request so there's data to export
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'GDPR test data',
        brand: 'Fiat',
        model: '500',
        modelYear: '2015',
        engineCC: '1200',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
  })

  test('Data export requires auth', async ({ request }) => {
    const resp = await request.post('/api/account/export', {
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(401)
  })

  test('Data export with wrong password fails', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/export', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: 'wrongpassword' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('Data export with correct password succeeds', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/export', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(200)

    const contentType = resp.headers()['content-type'] || ''
    expect(contentType).toContain('application/json')

    const data = await resp.json()
    // Export should contain profile data
    expect(data.profile || data.client).toBeTruthy()
  })

  test('Account deletion with wrong password fails', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/delete', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: 'wrongpassword' },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('Account deletion with correct password succeeds', async ({ request }) => {
    const login = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    const resp = await request.post('/api/account/delete', {
      headers: { Cookie: `auth-token=${login.token}` },
      data: { password: CLIENT_PASSWORD },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.summary).toBeTruthy()
    console.log(`  Deleted: ${JSON.stringify(data.summary)}`)
  })

  test('Login fails after account deletion', async ({ request }) => {
    const { status, data } = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    expect(data.success).toBeFalsy()
  })
})

test.describe('Account deletion anonymizes, it does not delete', () => {
  test('a client: personal data and photos go, the job history stays without them', async ({ playwright, request }) => {
    // Keys staged on the rows directly, as elsewhere in the suite, so no real
    // upload is needed: S3 deletes are idempotent, and what this pins is that
    // every one of the client's objects is found.
    const { api, email, password, token } = await freshClient(playwright, 'gdpr-anon')
    const sr = await (await api.post('/api/service-request/', {
      data: mechanicalRequest({ description: 'Ο Γιάννης Παπαδόπουλος, κινητό 6970000000', vinNumber: 'VF3ANONYMIZE00001', licensePlate: 'ΙΚΧ-1234' }),
    })).json()
    await setRequestFields(sr.serviceRequestId, { photoUrls: [`Requests/${sr.serviceRequestId}/e2e-anon-photo.jpg`] })
    await setLicensePhotoKey(sr.vehicleId, `Requests/${sr.vehicleId}/license/e2e-anon.png`)

    const garage = await newGarage(request, { prefix: 'gdpr-anon' })
    const fromGarage = await postMessage(request, garage.token, sr.serviceRequestId, 'Καλημέρα, στείλτε μου φωτογραφία')
    expect(fromGarage.status()).toBe(200)
    const garageMessageId = (await fromGarage.json()).message.id as string
    const fromClient = await postMessage(request, token, sr.serviceRequestId, 'Είμαι ο Γιάννης, ορίστε', garage.id)
    expect(fromClient.status(), await fromClient.text()).toBe(200)
    const clientMessageId = (await fromClient.json()).message.id as string
    await setChatMessageFields(clientMessageId, {
      attachments: [{ s3Key: `Requests/${sr.serviceRequestId}/chat/e2e-anon.jpg`, contentType: 'image/jpeg' }],
    })

    const resp = await api.post('/api/account/delete/', { data: { password } })
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await resp.json()).summary).toMatchObject({
      requestsCancelled: 1, requestsAnonymized: 1, vehiclesAnonymized: 1, chatMessagesAnonymized: 1, s3Objects: 3,
    })

    // The account row survives with nothing personal on it.
    const account = await getRow('Clients', sr.clientId)
    expect(account?.anonymizedAt).toBeTruthy()
    expect(account?.isActive).toBe(false)
    for (const field of ['email', 'passwordHash', 'firstName', 'lastName', 'phoneNumber', 'address']) {
      expect(account, field).not.toHaveProperty(field)
    }

    // The request is history: closed, without its free text or photos.
    const job = await getRow('ServiceRequests', sr.serviceRequestId)
    expect(job?.status).toBe('cancelled')
    expect(job?.category).toBe('symplektis')
    expect(job).not.toHaveProperty('description')
    expect(job).not.toHaveProperty('photoUrls')

    // The car as make and model only.
    const car = await getRow('Vehicles', sr.vehicleId)
    expect(car?.brand).toBe(mechanicalRequest().brand)
    for (const field of ['vinNumber', 'licensePlate', 'engineNumber', 'licensePhotoUrl', 'color']) {
      expect(car, field).not.toHaveProperty(field)
    }

    // Their side of the chat is gone; the garage's is untouched.
    const theirs = await getRow('ChatMessages', clientMessageId)
    expect(theirs).toMatchObject({ message: 'Το μήνυμα διαγράφηκε', senderName: 'Πελάτης' })
    expect(theirs).not.toHaveProperty('attachments')
    expect((await getRow('ChatMessages', garageMessageId))?.message).toBe('Καλημέρα, στείλτε μου φωτογραφία')

    // Nothing logs in as it any more, and the old cookie is dead.
    expect((await loginViaAPI(request, email, password, 'client')).data.success).toBeFalsy()
    expect((await request.get('/api/auth/me/', { headers: cookie(token) })).status()).toBe(401)
    const refiled = await request.post('/api/service-request/', { headers: cookie(token), data: mechanicalRequest() })
    expect(refiled.status()).toBe(401)
    // The address is free for a new account.
    expect((await registerClient(request, email, password)).client?.id).toBeTruthy()
  })

  test('a booking that has not happened blocks it; once it has, the job survives the client for the garage to close', async ({ request }) => {
    const client = await newClient(request, 'gdpr-booked')
    const garage = await newGarage(request, { prefix: 'gdpr-booked' })
    const requestId = await newRequest(request, client)
    const offerId = await makeOffer(request, garage, requestId)
    await acceptOffer(request, client, requestId, offerId)

    const early = await request.post('/api/account/delete/', { headers: cookie(client.token), data: { password: PASSWORD } })
    expect(early.status()).toBe(409)
    expect((await early.json()).code).toBe('UPCOMING_APPOINTMENT')
    const garageEarly = await request.post('/api/account/delete/', { headers: cookie(garage.token), data: { password: PASSWORD } })
    expect(garageEarly.status()).toBe(409)
    expect((await getRow('Clients', client.clientId))?.email).toBe(client.email)

    // The appointment has passed: the client may go, the job is still the garage's to declare.
    await ageAppointment(requestId, offerId, 2)
    const later = await request.post('/api/account/delete/', { headers: cookie(client.token), data: { password: PASSWORD } })
    expect(later.status(), await later.text()).toBe(200)
    expect((await getRow('ServiceRequests', requestId))?.status).toBe('appointment')
    await completeJob(request, garage, requestId)
    const done = await getRow('ServiceRequests', requestId)
    expect(done?.status).toBe('completed')
    expect(done?.finalAmounts).toBeTruthy()
  })

  test('a garage: off the marketplace for good, its business record and history kept for invoicing', async ({ request }) => {
    const garage = await newGarage(request, { prefix: 'gdpr-garage-close' })
    const client = await newClient(request, 'gdpr-garage-close')
    const requestId = await newRequest(request, client)
    const offerId = await makeOffer(request, garage, requestId)

    const resp = await request.post('/api/account/delete/', { headers: cookie(garage.token), data: { password: PASSWORD } })
    expect(resp.status(), await resp.text()).toBe(200)
    expect((await resp.json()).summary.offersWithdrawn).toBe(1)

    const row = await getRow('Garages', garage.id)
    expect(row).toMatchObject({ isActive: false })
    expect(row?.anonymizedAt).toBeTruthy()
    expect(row?.companyName).toBeTruthy()
    expect(row?.address).toBe('Οδός Δοκιμής 1, Αθήνα')
    for (const field of ['email', 'passwordHash', 'mobile', 'contactFirstName', 'contactLastName']) {
      expect(row, field).not.toHaveProperty(field)
    }
    expect((await getRow('Offers', offerId))?.status).toBe('expired')

    expect((await loginViaAPI(request, garage.email, PASSWORD, 'garage')).data.success).toBeFalsy()
    // An admin cannot reopen it.
    const admin = await loginAdmin(request)
    const reopen = await request.post(`/api/admin/users/garages/${garage.id}/activate/`, { headers: { Cookie: admin } })
    expect(reopen.status()).toBe(404)
    expect((await getRow('Garages', garage.id))?.isActive).toBe(false)
  })
})

/** Every JSON path whose string value contains `needle` — names the leak, not just that there is one. */
function pathsContaining(value: unknown, needle: string, path = '$'): string[] {
  if (typeof value === 'string') return value.includes(needle) ? [path] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => pathsContaining(v, needle, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => pathsContaining(v, needle, `${path}.${k}`))
  }
  return []
}

test.describe('GDPR: a garage export follows the winner-only rule', () => {
  test("A garage that lost the job finds only the client's first name in its export", async ({ request }) => {
    const client = await newClient(request, 'gdpr-export')
    await setClientName(client.clientId, 'Ελένη', 'Εξαγωγοπούλου')
    const winner = await newGarage(request, { prefix: 'gdpr-winner' })
    const loser = await newGarage(request, { prefix: 'gdpr-loser' })
    const requestId = await newRequest(request, client)
    const winnerOffer = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)

    // Written while the request is open, so both rows store the full name.
    for (const garage of [loser, winner]) {
      const sent = await postMessage(request, client.token, requestId, 'Καλησπέρα, πότε μπορώ να έρθω;', garage.id)
      expect(sent.status(), await sent.text()).toBeLessThan(300)
    }
    await acceptOffer(request, client, requestId, winnerOffer)

    const exportFor = async (garage: { token: string }) => {
      const resp = await request.post('/api/account/export', {
        headers: cookie(garage.token),
        data: { password: PASSWORD },
      })
      expect(resp.status()).toBe(200)
      return resp.json()
    }
    const clientRows = (data: { chatMessages: Record<string, unknown>[] }) =>
      data.chatMessages.filter((m) => m.requestId === requestId && m.senderType === 'client')

    const lost = await exportFor(loser)
    expect(clientRows(lost).length).toBeGreaterThan(0)
    for (const m of clientRows(lost)) expect(m.senderName).toBe('Ελένη')
    // Nowhere in the export — not the chat, the emails or the activity log.
    expect(pathsContaining(lost, 'Εξαγωγοπούλου')).toEqual([])

    const won = await exportFor(winner)
    expect(clientRows(won).some((m) => String(m.senderName).includes('Εξαγωγοπούλου'))).toBe(true)
  })
})
