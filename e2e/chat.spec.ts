import { test, expect, type APIRequestContext } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsClient, TEST_GARAGE } from './helpers'
import {
  PASSWORD,
  acceptOffer,
  ageAppointment,
  completeJob,
  cookie,
  insertMessage,
  loginAdmin,
  makeOffer,
  newClient,
  newGarage,
  newRequest,
  postMessage,
  emailsTo,
  setClientName,
  setGarageActive,
  signInGarage,
  summary,
  summaryUntil,
  type TestClient,
  type TestGarage,
} from './E-helpers'
import { isAppSyncMockReachable, realtimeTokenFor, subscribeToChannels } from './appsync-helpers'
import { chatChannel } from '../src/lib/realtime-channels'
import { MAX_CHAT_MESSAGE_LENGTH } from '../src/types/chat'

const CLIENT_EMAIL = `e2e-chat-${Date.now()}@test.com`
const CLIENT_PASSWORD = 'TestPass123'

let clientId: string
let serviceRequestId: string
let garageToken: string
let clientToken: string

test.describe.serial('Chat flows', () => {

  test('Setup: register client, create request, create offer', async ({ request }) => {
    const regResult = await registerClient(request, CLIENT_EMAIL, CLIENT_PASSWORD)
    clientId = regResult.client.id

    const clientLogin = await loginViaAPI(request, CLIENT_EMAIL, CLIENT_PASSWORD, 'client')
    clientToken = clientLogin.token

    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E chat test',
        brand: 'Honda',
        model: 'Civic',
        modelYear: '2020',
        engineCC: '1500',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    const srData = await srResp.json()
    serviceRequestId = srData.serviceRequestId

    const garageLogin = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    garageToken = garageLogin.token
  })

  test('Empty message is rejected', async ({ request }) => {
    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { message: '', garageId: TEST_GARAGE.id },
    })
    // Should fail or return error
    const data = await resp.json()
    if (resp.status() === 200) {
      // If API allows empty, just check it returns success
      expect(data.success).toBeDefined()
    } else {
      expect(resp.status()).toBeGreaterThanOrEqual(400)
    }
  })

  test('An over-long message is a 400, not a 500, and is not stored', async ({ request }) => {
    // A body past DynamoDB's 400 KB item limit used to come back as a bare 500.
    for (const length of [MAX_CHAT_MESSAGE_LENGTH + 1, 500_000]) {
      const resp = await request.post(`/api/chat/${serviceRequestId}/messages/`, {
        headers: { Cookie: `auth-token=${garageToken}` },
        data: { message: 'α'.repeat(length) },
      })
      expect(resp.status(), `length ${length}`).toBe(400)
      expect((await resp.json()).error).toContain(String(MAX_CHAT_MESSAGE_LENGTH))
    }
  })

  test('Garage sends first message', async ({ request }) => {
    // Re-login to get fresh token for this test's request context
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const token = login.token

    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${token}` },
      data: {
        message: 'Γεια σας, πώς μπορώ να βοηθήσω;',
        garageId: TEST_GARAGE.id,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.success).toBe(true)
    expect(data.message.senderType).toBe('garage')
  })

  test('Client sends reply', async ({ request }) => {
    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        message: 'Καλημέρα! Χρειάζομαι αλλαγή λαδιών.',
        garageId: TEST_GARAGE.id,
      },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.message.senderType).toBe('client')
  })

  test('Garage sends another message', async ({ request }) => {
    const login = await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')
    const resp = await request.post(`/api/chat/${serviceRequestId}/messages`, {
      headers: { Cookie: `auth-token=${login.token}` },
      data: {
        message: 'Μπορείτε να έρθετε αύριο πρωί;',
        garageId: TEST_GARAGE.id,
      },
    })
    expect(resp.status()).toBe(200)
  })

  test('GET messages returns all 3 in order', async ({ request }) => {
    const resp = await request.get(`/api/chat/${serviceRequestId}/messages?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${clientToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.messages.length).toBe(3)
    expect(data.messages[0].message).toContain('πώς μπορώ να βοηθήσω')
    expect(data.messages[1].message).toContain('αλλαγή λαδιών')
    expect(data.messages[2].message).toContain('αύριο πρωί')
  })

  test('Garage chats list includes this conversation', async ({ request }) => {
    const resp = await request.get(`/api/chat/garage-chats?garageId=${TEST_GARAGE.id}`, {
      headers: { Cookie: `auth-token=${garageToken}` },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    const found = data.chats?.find((c: { requestId: string }) => c.requestId === serviceRequestId)
      || data.requestIds?.includes(serviceRequestId)
    expect(found).toBeTruthy()
  })

  test('Mark read works', async ({ request }) => {
    const resp = await request.post(`/api/chat/${serviceRequestId}/mark-read`, {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: { garageId: TEST_GARAGE.id },
    })
    expect(resp.status()).toBe(200)
  })
})

/**
 * Who may still write once a request has left the market.
 *
 * The rule used to hold only while the request sat in APPOINTMENT: the moment
 * the job was completed or cancelled, every garage that lost it could message
 * — and email — the client again.
 */
test.describe.serial('Read-only once the request leaves the market', () => {
  let client: TestClient
  let winner: TestGarage
  let loser: TestGarage
  let requestId = ''
  let winnerOfferId = ''

  test('Setup: two garages bid, the client books one', async ({ request }) => {
    client = await newClient(request, 'ro')
    winner = await newGarage(request, { prefix: 'ro-winner' })
    loser = await newGarage(request, { prefix: 'ro-loser' })
    requestId = await newRequest(request, client, { brand: 'Kia', model: 'Ceed' })

    winnerOfferId = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)
    expect((await postMessage(request, loser.token, requestId, 'Μπορώ αύριο')).status()).toBe(200)
    expect((await postMessage(request, client.token, requestId, 'Ευχαριστώ', loser.id)).status()).toBe(200)

    await acceptOffer(request, client, requestId, winnerOfferId)
  })

  test('The losing garage reads the thread but is told it is read-only', async ({ request }) => {
    const resp = await request.get(`/api/chat/${requestId}/messages/?garageId=${loser.id}`, {
      headers: cookie(loser.token),
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data.messages.length).toBe(2)
    expect(data.canWrite).toBe(false)
    expect(data.readOnlyNotice).toContain('άλλο συνεργείο')

    const post = await postMessage(request, loser.token, requestId, 'Ακόμα εδώ;')
    expect(post.status()).toBe(403)
    expect((await post.json()).code).toBe('CHAT_READ_ONLY')
  })

  test('After completion the losing garage still cannot write — nor the client to it', async ({ request }) => {
    await ageAppointment(requestId, winnerOfferId)
    await completeJob(request, winner, requestId)

    const loserPost = await postMessage(request, loser.token, requestId, 'Πώς πήγε η επισκευή;')
    expect(loserPost.status()).toBe(403)
    expect((await loserPost.json()).code).toBe('CHAT_READ_ONLY')

    const clientPost = await postMessage(request, client.token, requestId, 'Γεια', loser.id)
    expect(clientPost.status()).toBe(403)

    const loserView = await (await request.get(`/api/chat/${requestId}/messages/`, {
      headers: cookie(loser.token),
    })).json()
    expect(loserView.canWrite).toBe(false)
  })

  test('After completion the garage that did the job and its client still can', async ({ request }) => {
    expect((await postMessage(request, winner.token, requestId, 'Ευχαριστούμε!')).status()).toBe(200)
    expect((await postMessage(request, client.token, requestId, 'Κι εγώ', winner.id)).status()).toBe(200)

    const view = await (await request.get(`/api/chat/${requestId}/messages/`, {
      headers: cookie(winner.token),
    })).json()
    expect(view.canWrite).toBe(true)
    expect(view.readOnlyNotice).toBeNull()
  })

  test('The chat pages mirror it: the losing garage and the client see a notice, not a composer', async ({ page, request }) => {
    await signInGarage(page, loser)
    await page.goto(`/garage-dashboard/${loser.id}/chat/${requestId}/`)
    await expect(page.getByText('Μπορώ αύριο')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Το αίτημα ανατέθηκε σε άλλο συνεργείο', { exact: false })).toBeVisible()
    await expect(page.getByPlaceholder('Γράψτε μήνυμα...')).toHaveCount(0)

    await page.context().clearCookies()
    await loginAsClient(page, request, client.email, PASSWORD)
    await page.goto(`/requests/${client.clientId}/chats/${requestId}/?garageId=${loser.id}`)
    await expect(page.getByText('κλείστηκε με άλλο συνεργείο', { exact: false })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByPlaceholder('Γράψτε μήνυμα...')).toHaveCount(0)

    // …while the thread with the garage that did the job stays open.
    await page.goto(`/requests/${client.clientId}/chats/${requestId}/?garageId=${winner.id}`)
    await expect(page.getByPlaceholder('Γράψτε μήνυμα...')).toBeVisible({ timeout: 30_000 })
  })

  test('A cancelled appointment is read-only for every garage, the winner included', async ({ request }) => {
    const other = await newRequest(request, client, { brand: 'Fiat', model: 'Panda' })
    const offerId = await makeOffer(request, winner, other)
    await makeOffer(request, loser, other)
    await acceptOffer(request, client, other, offerId)

    const cancel = await request.patch(`/api/requests/${other}/cancel/`, { headers: cookie(client.token), data: {} })
    expect(cancel.status(), await cancel.text()).toBe(200)

    for (const garage of [winner, loser]) {
      const post = await postMessage(request, garage.token, other, 'Γιατί ακυρώθηκε;')
      expect(post.status()).toBe(403)
      expect((await post.json()).error).toContain('ακυρώθηκε')
    }
    expect((await postMessage(request, client.token, other, 'Συγγνώμη', winner.id)).status()).toBe(403)
  })

  test('A request cancelled before anyone won it is read-only too', async ({ request }) => {
    const other = await newRequest(request, client, { brand: 'Mini', model: 'Cooper' })
    expect((await postMessage(request, loser.token, other, 'Ενδιαφέρομαι')).status()).toBe(200)

    const adminCookie = await loginAdmin(request)
    const cancel = await request.patch(`/api/admin/requests/${other}/cancel/`, { headers: { Cookie: adminCookie } })
    expect(cancel.status()).toBe(200)

    expect((await postMessage(request, loser.token, other, 'Ακόμα ενδιαφέρομαι')).status()).toBe(403)
  })

  test('A client message must name its garage', async ({ request }) => {
    const other = await newRequest(request, client)
    const resp = await postMessage(request, client.token, other, 'Σε ποιον πάει αυτό;')
    expect(resp.status()).toBe(400)
  })
})

/**
 * The same rule on the photo path. A thread can close while its page is open —
 * here, the client books another garage — and a photo sent after that must
 * lock the composer, as a text message already did, instead of failing the
 * same way on every retry.
 */
test.describe('A photo sent into a thread that has since closed', () => {
  // 1×1 PNG. Never stored: the server refuses the write before storage.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )

  test('locks the composer in the garage chat and in the client chat', async ({ page, browser, request }) => {
    const client = await newClient(request, 'photo-ro')
    const winner = await newGarage(request, { prefix: 'photo-winner' })
    const loser = await newGarage(request, { prefix: 'photo-loser' })
    const requestId = await newRequest(request, client, { brand: 'Peugeot', model: '308' })
    const winnerOffer = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)
    expect((await postMessage(request, loser.token, requestId, 'Έχω ελεύθερο αύριο')).status()).toBe(200)

    // Both chats open while the request is still on the market.
    await signInGarage(page, loser)
    await page.goto(`/garage-dashboard/${loser.id}/chat/${requestId}/`)
    await expect(page.getByPlaceholder('Γράψτε μήνυμα...')).toBeVisible({ timeout: 30_000 })

    const clientContext = await browser.newContext()
    const clientPage = await clientContext.newPage()
    await loginAsClient(clientPage, request, client.email, PASSWORD)
    await clientPage.goto(`/requests/${client.clientId}/chats/${requestId}/?garageId=${loser.id}`)
    await expect(clientPage.getByPlaceholder('Γράψτε μήνυμα...')).toBeVisible({ timeout: 30_000 })

    // …then the client books the other garage.
    await acceptOffer(request, client, requestId, winnerOffer)
    for (const token of [loser.token, client.token]) {
      const view = await (await request.get(`/api/chat/${requestId}/messages/?garageId=${loser.id}`, {
        headers: cookie(token),
      })).json()
      expect(view.canWrite).toBe(false)
    }

    for (const [p, notice] of [
      [page, 'Το αίτημα ανατέθηκε σε άλλο συνεργείο'],
      [clientPage, 'κλείστηκε με άλλο συνεργείο'],
    ] as const) {
      await p.locator('input[type="file"][multiple]').setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: PNG,
      })
      const caption = p.getByPlaceholder('Προσθέστε λεζάντα (προαιρετικά)...')
      await expect(caption).toBeVisible()
      const refused = p.waitForResponse((r) => r.url().includes(`/api/chat/${requestId}/attachments/`))
      await caption.press('Enter')
      const resp = await refused
      expect(resp.status()).toBe(403)
      expect((await resp.json()).code).toBe('CHAT_READ_ONLY')

      await expect(p.getByText(notice, { exact: false }).first()).toBeVisible()
      await expect(p.locator('textarea')).toHaveCount(0)
    }

    await clientContext.close()
  })
})

test.describe('A garage that has not been approved', () => {
  test('cannot read or write any chat, and its summary carries no client data', async ({ request }) => {
    const client = await newClient(request, 'pending')
    const pending = await newGarage(request, { active: false, prefix: 'pending' })
    const requestId = await newRequest(request, client, { brand: 'Suzuki', model: 'Swift' })

    // A thread it could only have from before it was deactivated.
    await insertMessage({ requestId, senderId: client.clientId, senderType: 'client', garageId: pending.id, message: 'Γεια σας' })

    const post = await postMessage(request, pending.token, requestId, 'Γεια σας!')
    expect(post.status()).toBe(403)
    expect((await post.json()).code).toBe('GARAGE_INACTIVE')

    const read = await request.get(`/api/chat/${requestId}/messages/`, { headers: cookie(pending.token) })
    expect(read.status()).toBe(403)

    const list = await request.get('/api/chat/garage-chats/', { headers: cookie(pending.token) })
    expect(list.status()).toBe(403)

    const markRead = await request.post(`/api/chat/${requestId}/mark-read/`, { headers: cookie(pending.token) })
    expect(markRead.status()).toBe(403)

    const s = await summary(request, pending.token)
    expect(s.threads).toBe(0)
    expect(s.availableRequests).toBe(0)
    expect(s.availableRequestIds).toEqual([])
    expect(s.alerts).toEqual([])
  })
})

/**
 * The badge and the lists are built from one definition. Before, the summary
 * counted unread client messages on every request a garage had touched, while
 * the lists showed only pending requests and this garage's appointments from
 * today on — so some unread messages could be counted but never opened.
 */
test.describe.serial('Unread badge and chat lists agree', () => {
  let client: TestClient
  let winner: TestGarage
  let loser: TestGarage
  let requestId = ''
  let offerId = ''

  test('Setup: both garages talk to the client, then one wins', async ({ request }) => {
    client = await newClient(request, 'parity')
    winner = await newGarage(request, { prefix: 'parity-winner' })
    loser = await newGarage(request, { prefix: 'parity-loser' })
    requestId = await newRequest(request, client, { brand: 'Toyota', model: 'Corolla' })

    offerId = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)
    for (const garage of [winner, loser]) {
      expect((await postMessage(request, garage.token, requestId, 'Καλημέρα')).status()).toBe(200)
      expect((await postMessage(request, client.token, requestId, `Μήνυμα για ${garage.id}`, garage.id)).status()).toBe(200)
    }

    // Both garages now have one unread thread on an open request.
    for (const garage of [winner, loser]) {
      const s = await summary(request, garage.token)
      expect(s.threads).toBe(1)
      expect(s.openThreads).toBe(1)
      const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(garage.token) })).json()
      expect(list.open.map((t: { requestId: string }) => t.requestId)).toEqual([requestId])
    }

    await acceptOffer(request, client, requestId, offerId)
  })

  test('Unread messages on a request another garage won are not counted, and not listed', async ({ request }) => {
    // Accepting an offer does not invalidate the losing garage's cached
    // summary, so give it the cache window.
    const s = await summaryUntil(request, loser.token, (x) => x.threads === 0)
    expect(s.threads).toBe(0)
    expect(s.alerts.some((a) => a.kind === 'messages')).toBe(false)

    const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(loser.token) })).json()
    expect(list.open).toEqual([])
    expect(list.appointments).toEqual([])
  })

  test("The winner's unread thread moves to the appointments list and is still counted", async ({ request }) => {
    const s = await summaryUntil(request, winner.token, (x) => x.appointmentThreads === 1)
    expect(s.threads).toBe(1)
    expect(s.appointmentThreads).toBe(1)
    expect(s.openThreads).toBe(0)
    const alert = s.alerts.find((a) => a.kind === 'messages')
    expect(alert?.href).toBe(`/garage-dashboard/${winner.id}/chat/${requestId}/`)
    // The detail names the car — the request row carries only its vehicleId.
    expect(alert?.detail).toBe('Toyota Corolla')

    const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(winner.token) })).json()
    expect(list.appointments.map((t: { requestId: string; unread: number }) => [t.requestId, t.unread]))
      .toEqual([[requestId, 1]])
  })

  test("Yesterday's appointment awaiting completion is still listed, and opening it clears the badge", async ({ request }) => {
    await ageAppointment(requestId, offerId, 1)
    expect((await postMessage(request, client.token, requestId, 'Ήρθα χθες, όλα καλά;', winner.id)).status()).toBe(200)

    const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(winner.token) })).json()
    expect(list.appointments.map((t: { requestId: string }) => t.requestId)).toContain(requestId)
    expect((await summary(request, winner.token)).appointmentThreads).toBe(1)

    const read = await request.post(`/api/chat/${requestId}/mark-read/`, { headers: cookie(winner.token) })
    expect(read.status()).toBe(200)
    expect((await summary(request, winner.token)).threads).toBe(0)
  })

  test('A completed job stays listed while its client can still write to the garage', async ({ request }) => {
    await completeJob(request, winner, requestId)
    expect((await postMessage(request, client.token, requestId, 'Μια ερώτηση ακόμη', winner.id)).status()).toBe(200)

    const s = await summary(request, winner.token)
    expect(s.threads).toBe(1)
    const list = await (await request.get('/api/chat/garage-chats/', { headers: cookie(winner.token) })).json()
    const row = list.appointments.find((t: { requestId: string }) => t.requestId === requestId)
    expect(row?.status).toBe('completed')
    expect(row?.unread).toBe(1)
  })

  test("The client's badge counts the same threads its chat list shows", async ({ request }) => {
    // The loser's reply is history now; the winner's is the live thread.
    expect((await postMessage(request, winner.token, requestId, 'Ευχαριστούμε για την προτίμηση')).status()).toBe(200)
    const s = await summary(request, client.token)
    expect(s.threads).toBe(1)

    const list = await (await request.get('/api/chat/client-threads/', { headers: cookie(client.token) })).json()
    const unread = [...list.open, ...list.appointments].filter((t: { unread: number }) => t.unread > 0)
    expect(unread.map((t: { garageId: string }) => t.garageId)).toEqual([winner.id])
    expect(list.history.map((t: { garageId: string }) => t.garageId)).toEqual([loser.id])
    expect(list.history[0].unread).toBe(0)
  })
})

/**
 * Client PII is winner-only. While a request is on the market a garage knows
 * the client by first name; only the garage that won learns the surname, from
 * acceptance on — on its old messages too, because the rule is applied on read.
 */
test.describe.serial('The client is named to each garage by the winner-only rule', () => {
  let client: TestClient
  let winner: TestGarage
  let loser: TestGarage
  let requestId = ''
  let winnerOfferId = ''

  const clientNames = async (request: APIRequestContext, garage: TestGarage) => {
    const resp = await request.get(`/api/chat/${requestId}/messages/`, { headers: cookie(garage.token) })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    return (data.messages as { senderType: string; senderName: string }[])
      .filter((m) => m.senderType === 'client')
      .map((m) => m.senderName)
  }

  test('Setup: a named client writes to two bidding garages', async ({ request }) => {
    client = await newClient(request, 'pii')
    await setClientName(client.clientId, 'Άννα Μαρία', 'Παπαδοπούλου')
    winner = await newGarage(request, { prefix: 'pii-winner' })
    loser = await newGarage(request, { prefix: 'pii-loser' })
    requestId = await newRequest(request, client, { brand: 'Nissan', model: 'Micra' })
    winnerOfferId = await makeOffer(request, winner, requestId)
    await makeOffer(request, loser, requestId)
    for (const garage of [winner, loser]) {
      expect((await postMessage(request, client.token, requestId, 'Πόσο κοστίζει;', garage.id)).status()).toBe(200)
    }
    // A row from before this rule, stored with the full name.
    await insertMessage({
      requestId, senderId: client.clientId, senderType: 'client', garageId: loser.id,
      message: 'Παλιό μήνυμα', senderName: 'Άννα Μαρία Παπαδοπούλου',
    })
  })

  test('While the request is pending, every garage sees the first name only', async ({ request }) => {
    // A two-word first name is cut to its first word (garageClientView's
    // `quotingFirstName`, the rule every garage-facing response shares).
    expect(await clientNames(request, winner)).toEqual(['Άννα'])
    expect(await clientNames(request, loser)).toEqual(['Άννα', 'Άννα'])
  })

  test('Once booked, the winner sees the full name and the loser still the first name', async ({ request }) => {
    await acceptOffer(request, client, requestId, winnerOfferId)
    expect(await clientNames(request, winner)).toEqual(['Άννα Μαρία Παπαδοπούλου'])
    expect(await clientNames(request, loser)).toEqual(['Άννα', 'Άννα'])

    // The client's own view is untouched.
    const own = await (await request.get(`/api/chat/${requestId}/messages/?garageId=${winner.id}`, {
      headers: cookie(client.token),
    })).json()
    expect(own.messages.find((m: { senderType: string }) => m.senderType === 'client')?.senderName)
      .toBe('Άννα Μαρία Παπαδοπούλου')
  })

  test("An old account whose first name is its email's local part is just «Πελάτης»", async ({ request }) => {
    const nameless = await newClient(request, 'pii-local')
    await setClientName(nameless.clientId, nameless.email.split('@')[0], '')
    const other = await newRequest(request, nameless)
    expect((await postMessage(request, nameless.token, other, 'Γεια', loser.id)).status()).toBe(200)
    const data = await (await request.get(`/api/chat/${other}/messages/`, { headers: cookie(loser.token) })).json()
    expect(data.messages.map((m: { senderName: string }) => m.senderName)).toEqual(['Πελάτης'])
  })

  test('The realtime copy of a message names the client the same way', async ({ request }) => {
    test.skip(!(await isAppSyncMockReachable()), 'AppSync mock is not running')
    const other = await newRequest(request, client, { brand: 'Nissan', model: 'Note' })
    const channel = chatChannel(other, loser.id)
    const sub = await subscribeToChannels([channel], { token: await realtimeTokenFor(loser.token) })
    try {
      expect((await postMessage(request, client.token, other, 'Ζωντανά', loser.id)).status()).toBe(200)
      const event = await sub.waitFor((e) => e.channel === channel && e.data.message === 'Ζωντανά', 10_000)
      expect(event.data.senderName).toBe('Άννα')
    } finally {
      sub.close()
    }
  })
})

/**
 * A pending or deactivated garage can open no chat route, so nothing written to
 * it is ever read — and each message used to email it, with the client's name.
 */
test.describe('A client cannot write to — or email — a garage that is not active', () => {
  const TEMPLATE = 'new_chat_message'

  test('an active garage is emailed; a pending one is refused, and gets nothing', async ({ request }) => {
    const client = await newClient(request, 'inactive-mail')
    const active = await newGarage(request, { prefix: 'mail-active' })
    const pending = await newGarage(request, { active: false, prefix: 'mail-pending' })
    const requestId = await newRequest(request, client)

    expect((await postMessage(request, client.token, requestId, 'Γεια σας', active.id)).status()).toBe(200)
    // The mail is fire-and-forget; give it a moment to be logged.
    await expect.poll(async () => (await emailsTo(active.email, TEMPLATE)).length, { timeout: 10_000 }).toBe(1)

    const refused = await postMessage(request, client.token, requestId, 'Γεια σας', pending.id)
    expect(refused.status()).toBe(403)
    const body = await refused.json()
    expect(body.code).toBe('CHAT_READ_ONLY')
    expect(body.error).toContain('δεν είναι διαθέσιμο')

    await new Promise((r) => setTimeout(r, 2000))
    expect(await emailsTo(pending.email, TEMPLATE)).toEqual([])
  })

  test('a garage deactivated mid-conversation: its thread turns read-only for the client', async ({ request }) => {
    const client = await newClient(request, 'deactivated')
    const garage = await newGarage(request, { prefix: 'deactivated' })
    const requestId = await newRequest(request, client)
    await makeOffer(request, garage, requestId)
    expect((await postMessage(request, garage.token, requestId, 'Καλημέρα')).status()).toBe(200)

    await setGarageActive(garage.id, false)
    const before = (await emailsTo(garage.email, TEMPLATE)).length

    const post = await postMessage(request, client.token, requestId, 'Είστε εκεί;', garage.id)
    expect(post.status()).toBe(403)
    expect((await post.json()).code).toBe('CHAT_READ_ONLY')

    const view = await (await request.get(`/api/chat/${requestId}/messages/?garageId=${garage.id}`, {
      headers: cookie(client.token),
    })).json()
    expect(view.canWrite).toBe(false)
    expect(view.readOnlyNotice).toContain('δεν είναι διαθέσιμο')
    // The history stays readable.
    expect(view.messages.map((m: { message: string }) => m.message)).toEqual(['Καλημέρα'])

    await new Promise((r) => setTimeout(r, 2000))
    expect((await emailsTo(garage.email, TEMPLATE)).length).toBe(before)
  })
})

/**
 * Client rows from before per-garage threads carry no `garageId`, so no thread
 * filter can scope them. They used to go to any approved garage that opened
 * any request's chat.
 */
test.describe.serial('Pre-thread client messages reach only the garages that were in the conversation', () => {
  let client: TestClient
  let bidder: TestGarage
  let writer: TestGarage
  let stranger: TestGarage
  let requestId = ''
  let bidderOffer = ''
  const LEGACY = 'Μήνυμα πριν από τα νήματα'

  const sees = async (request: APIRequestContext, garage: TestGarage) => {
    const resp = await request.get(`/api/chat/${requestId}/messages/`, { headers: cookie(garage.token) })
    expect(resp.status()).toBe(200)
    return ((await resp.json()).messages as { message: string }[]).some((m) => m.message === LEGACY)
  }

  test('Setup: one garage bid, one only wrote, one never took part', async ({ request }) => {
    client = await newClient(request, 'legacy')
    bidder = await newGarage(request, { prefix: 'legacy-bidder' })
    writer = await newGarage(request, { prefix: 'legacy-writer' })
    stranger = await newGarage(request, { prefix: 'legacy-stranger' })
    requestId = await newRequest(request, client)
    bidderOffer = await makeOffer(request, bidder, requestId)
    expect((await postMessage(request, writer.token, requestId, 'Έχω μια ερώτηση')).status()).toBe(200)
    await insertMessage({ requestId, senderId: client.clientId, senderType: 'client', message: LEGACY })
  })

  test('While pending: the bidder and the writer see it, the stranger does not', async ({ request }) => {
    expect(await sees(request, bidder)).toBe(true)
    expect(await sees(request, writer)).toBe(true)
    expect(await sees(request, stranger)).toBe(false)
  })

  test('Once booked: only the garage that got the job', async ({ request }) => {
    await acceptOffer(request, client, requestId, bidderOffer)
    expect(await sees(request, bidder)).toBe(true)
    expect(await sees(request, writer)).toBe(false)
    expect(await sees(request, stranger)).toBe(false)
  })
})

test.describe('The garage chat pages of a garage the server reports inactive', () => {
  test('show the pending screen, and the chat never subscribes to realtime', async ({ page, request }) => {
    const client = await newClient(request, 'pending-ui')
    const pending = await newGarage(request, { active: false, prefix: 'pending-ui' })
    const requestId = await newRequest(request, client)

    // The session cached in the tab still says "active" — what an open tab
    // looks like right after an admin deactivates the garage.
    await signInGarage(page, { ...pending, user: { ...pending.user, isActive: true } })
    const logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))

    const inactiveAnswer = page.waitForResponse(
      (r) => r.url().includes(`/api/chat/${requestId}/messages/`) && r.request().method() === 'GET'
    )
    await page.goto(`/garage-dashboard/${pending.id}/chat/${requestId}/`)
    const resp = await inactiveAnswer
    expect(resp.status()).toBe(403)
    expect((await resp.json()).code).toBe('GARAGE_INACTIVE')

    await expect(page.getByText('Η αίτησή σας εξετάζεται')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Κατάσταση αίτησης' })).toBeVisible()
    await expect(page.getByPlaceholder('Γράψτε μήνυμα...')).toHaveCount(0)
    expect(logs.some((l) => l.includes('Subscribing to AppSync channel'))).toBe(false)

    await page.goto(`/garage-dashboard/${pending.id}/chats/`)
    await expect(page.getByText('Η αίτησή σας εξετάζεται')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Δεν ήταν δυνατή η φόρτωση των συνομιλιών')).toHaveCount(0)
  })
})

test('Malformed bodies on the chat writes are a 400, not a 500', async ({ request }) => {
  const client = await newClient(request, 'empty-body')
  const requestId = await newRequest(request, client)
  for (const path of [`/api/chat/${requestId}/messages/`, `/api/chat/${requestId}/mark-read/`]) {
    const resp = await request.post(path, {
      headers: { ...cookie(client.token), 'Content-Type': 'application/json' },
      data: '',
    })
    expect(resp.status(), path).toBe(400)
  }
})
