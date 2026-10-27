import { test, expect } from '@playwright/test'
import { isAppSyncMockReachable, realtimeTokenFor, subscribeToChannels } from './appsync-helpers'
import {
  api,
  acceptOffer,
  ageAppointment,
  CLIENT_PII,
  decorateRequest,
  makeOffer,
  newClient,
  newGarage,
  newRequest,
  OFFER_DATES,
  signInGarage,
  unique,
  VEHICLE_PII,
  type Party,
} from './p-helpers'

/**
 * Client PII is winner-only.
 *
 * While a request is pending every active garage gets what it needs to quote:
 * the car (no plate, VIN or engine number), the job, the photos, the estimate
 * and the client's first name. Only the garage whose offer was accepted, and
 * only from the acceptance on, gets the surname, phone, email, plate, VIN,
 * engine number and άδεια. A garage that lost, or whose booking was cancelled,
 * keeps the quoting view of its own history.
 *
 * Before this, any garage that had ever bid read the client's phone, plate, VIN
 * and άδεια from the request detail long after a competitor won; the feed and
 * the realtime fan-out handed every pending client's phone and surname to every
 * active garage; and any garage session — pending ones included — could read
 * any client's profile (email, phone, address) by id.
 */

const tag = unique()
const n = tag.replace(/\D/g, '').slice(-8)
const OWNER_PROFILE = {
  firstName: 'Ελένη',
  lastName: `Ιδιωτική${n.slice(-5)}`,
  phoneNumber: `69${n}`,
  address: `Οδός Απορρήτου ${n.slice(-4)}, Αθήνα`,
}
const MAIN_IDS = { licensePlate: `PRV-${n.slice(-4)}`, vinNumber: `VINPRIVM${n}`, engineNumber: `ENGPM${n}` }
const CANCELLED_IDS = { licensePlate: `PRC-${n.slice(-4)}`, vinNumber: `VINPRIVC${n}`, engineNumber: `ENGPC${n}` }
const LIVE_IDS = { licensePlate: `PRL-${n.slice(-4)}`, vinNumber: `VINPRIVL${n}`, engineNumber: `ENGPL${n}` }
const ESTIMATE = 321

let owner: Party
let otherClient: Party
let quoting: Party
let winner: Party
let loser: Party
let cancelledGarage: Party
let pendingGarage: Party

let mainRequest: { requestId: string; vehicleId: string }
let cancelledRequest: { requestId: string; vehicleId: string }
let unnamedRequest: { requestId: string; vehicleId: string }
let winnerOfferId: string

/** Every value that identifies the owner or the car — none may appear in a quoting view. */
function ownerSecrets(ids = MAIN_IDS): string[] {
  return [OWNER_PROFILE.lastName, OWNER_PROFILE.phoneNumber, OWNER_PROFILE.address, owner.email, ...Object.values(ids)]
}

function expectNoneOf(payload: unknown, secrets: string[]) {
  const text = JSON.stringify(payload)
  for (const secret of secrets) expect(text, `leaked "${secret}"`).not.toContain(secret)
}

function expectQuotingClient(client: Record<string, unknown> | null) {
  expect(client).toEqual({ firstName: OWNER_PROFILE.firstName })
}

function expectQuotingVehicle(vehicle: Record<string, unknown> | null) {
  expect(vehicle).toMatchObject({ brand: 'Peugeot', model: '208', modelYear: '2019', engineCC: '1199', fuelType: 'petrol', isTurbo: true })
  for (const field of VEHICLE_PII) expect(vehicle?.[field], `vehicle.${field}`).toBeUndefined()
}

async function offerFor(garage: Party, requestId: string) {
  const res = await api('/api/garage/offers/', { token: garage.token })
  expect(res.status).toBe(200)
  const offer = (res.data.offers as Array<{ serviceRequestId: string; serviceRequest: Record<string, unknown> }>)
    .find((o) => o.serviceRequestId === requestId)
  expect(offer, `no offer on ${requestId}`).toBeTruthy()
  return offer!
}

/** Pages the feed until `requestId` turns up (it is newest-first, so it is near the top). */
async function feedEntry(garage: Party, requestId: string) {
  let cursor: string | null = null
  const seen: Array<Record<string, unknown>> = []
  for (let page = 0; page < 10; page++) {
    const res = await api(`/api/garage/available-requests/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      token: garage.token,
    })
    expect(res.status).toBe(200)
    seen.push(...res.data.requests)
    const hit = (res.data.requests as Array<{ id: string }>).find((r) => r.id === requestId)
    if (hit || !res.data.nextCursor) return { hit: hit as Record<string, unknown> | undefined, seen }
    cursor = res.data.nextCursor
  }
  return { hit: undefined, seen }
}

test.describe.serial('Winner-only client PII', () => {
  test('Setup: a client with a full profile, another without, five garages, two requests', async () => {
    owner = await newClient('owner', OWNER_PROFILE)
    otherClient = await newClient('other')
    ;[quoting, winner, loser, cancelledGarage, pendingGarage] = await Promise.all([
      newGarage('quoting'),
      newGarage('winner'),
      newGarage('loser'),
      newGarage('cancelled'),
      newGarage('pending', { active: false }),
    ])

    mainRequest = await newRequest(owner, MAIN_IDS, `E2E privacy main ${tag}`)
    await decorateRequest(mainRequest.requestId, mainRequest.vehicleId, ESTIMATE)
    cancelledRequest = await newRequest(owner, CANCELLED_IDS, `E2E privacy cancelled ${tag}`)
    await decorateRequest(cancelledRequest.requestId, cancelledRequest.vehicleId, ESTIMATE)
    unnamedRequest = await newRequest(otherClient, { licensePlate: '', vinNumber: '', engineNumber: '' }, `E2E privacy unnamed ${tag}`)
    await decorateRequest(unnamedRequest.requestId, unnamedRequest.vehicleId, ESTIMATE)
  })

  test('Pending: an active garage gets the quoting view — first name, the car, the estimate', async () => {
    const res = await api(`/api/requests/${mainRequest.requestId}/?viewerGarageId=${quoting.id}`, { token: quoting.token })
    expect(res.status).toBe(200)
    const request = res.data.request

    expectQuotingClient(request.client)
    expectQuotingVehicle(request.vehicle)
    expect(request.vehicle.licensePhotoUrl).toBeNull()
    // The hint the offer page shows: «Ο πελάτης είδε ενδεικτική εκτίμηση από X€».
    expect(request.estimatedCost).toBe(ESTIMATE)
    expect(request.category).toBe('allagi-ladion')
    expect(Array.isArray(request.photoUrls)).toBe(true)
    expectNoneOf(res.data, ownerSecrets())
  })

  test('Pending: an account with no name of its own shows none, not its email', async () => {
    const res = await api(`/api/requests/${unnamedRequest.requestId}/`, { token: quoting.token })
    expect(res.status).toBe(200)
    // Registration stores the email's local part as the first name.
    expect(res.data.request.client).toEqual({})
    expectNoneOf(res.data, [otherClient.email.split('@')[0]])
  })

  test('Pending: the feed carries the quoting view, for every request in it', async () => {
    const { hit, seen } = await feedEntry(quoting, mainRequest.requestId)
    expect(hit, 'request missing from the feed').toBeTruthy()
    expectQuotingClient(hit!.client as Record<string, unknown>)
    expectQuotingVehicle(hit!.vehicle as Record<string, unknown>)
    expect(hit!.estimatedCost).toBe(ESTIMATE)
    expectNoneOf(seen, ownerSecrets())

    for (const entry of seen) {
      for (const field of CLIENT_PII) expect((entry.client as Record<string, unknown>)?.[field], `feed client.${field}`).toBeUndefined()
      for (const field of VEHICLE_PII) expect((entry.vehicle as Record<string, unknown>)?.[field], `feed vehicle.${field}`).toBeUndefined()
    }
  })

  test('A pending (unapproved) garage and another client are shut out of every route', async () => {
    for (const path of [
      `/api/requests/${mainRequest.requestId}/`,
      '/api/garage/available-requests/',
      '/api/garage/offers/',
    ]) {
      const asPending = await api(path, { token: pendingGarage.token })
      expect(asPending.status, `pending garage ${path}`).toBe(403)
      expect(asPending.data.code).toBe('GARAGE_INACTIVE')

      const asClient = await api(path, { token: otherClient.token })
      expect(asClient.status, `other client ${path}`).toBe(403)
      expectNoneOf(asClient.data, ownerSecrets())
    }
  })

  test('Bidding: before the client chooses, a bidder still sees the first name only', async () => {
    winnerOfferId = await makeOffer(winner, mainRequest.requestId)
    await makeOffer(loser, mainRequest.requestId)

    const offer = await offerFor(winner, mainRequest.requestId)
    expectQuotingClient(offer.serviceRequest.client as Record<string, unknown>)
    expect((offer.serviceRequest.vehicle as Record<string, unknown>).licensePlate).toBeUndefined()
    expectNoneOf(offer, ownerSecrets())

    const detail = await api(`/api/requests/${mainRequest.requestId}/`, { token: loser.token })
    expect(detail.status).toBe(200)
    expectQuotingClient(detail.data.request.client)
    expectNoneOf(detail.data, ownerSecrets())
  })

  test('Setup: the client books the winner, and books then cancels the other job', async () => {
    await acceptOffer(owner, mainRequest.requestId, winnerOfferId)

    const cancelledOfferId = await makeOffer(cancelledGarage, cancelledRequest.requestId)
    await acceptOffer(owner, cancelledRequest.requestId, cancelledOfferId)
    // While it held the booking, that garage was the winner…
    const booked = await api(`/api/requests/${cancelledRequest.requestId}/`, { token: cancelledGarage.token })
    expect(booked.data.request.client.phoneNumber).toBe(OWNER_PROFILE.phoneNumber)

    const cancel = await api(`/api/requests/${cancelledRequest.requestId}/cancel/`, { method: 'PATCH', token: owner.token })
    expect(cancel.status, JSON.stringify(cancel.data)).toBe(200)
  })

  test('The winning garage sees the client and the car from the acceptance on', async () => {
    const res = await api(`/api/requests/${mainRequest.requestId}/?viewerGarageId=${winner.id}`, { token: winner.token })
    expect(res.status).toBe(200)
    const request = res.data.request

    expect(request.client).toEqual({
      firstName: OWNER_PROFILE.firstName,
      lastName: OWNER_PROFILE.lastName,
      phoneNumber: OWNER_PROFILE.phoneNumber,
      email: owner.email,
    })
    expect(request.vehicle).toMatchObject(MAIN_IDS)
    expect(request.vehicle.licensePhotoUrl).toContain('X-Amz-Signature')
    expect(request.acceptedGarageId).toBe(winner.id)
    expect(request.appointmentDate).toBe(OFFER_DATES[0])
    expect(request.estimatedCost).toBe(ESTIMATE)
    // The address is not part of the job.
    expectNoneOf(res.data, [OWNER_PROFILE.address])

    const offer = await offerFor(winner, mainRequest.requestId)
    expect(offer.serviceRequest.client).toMatchObject({
      lastName: OWNER_PROFILE.lastName,
      phoneNumber: OWNER_PROFILE.phoneNumber,
      email: owner.email,
    })
    expect((offer.serviceRequest.vehicle as Record<string, unknown>).licensePlate).toBe(MAIN_IDS.licensePlate)
  })

  test('The losing garage keeps only the quoting view of its own history', async () => {
    const res = await api(`/api/requests/${mainRequest.requestId}/?viewerGarageId=${loser.id}`, { token: loser.token })
    expect(res.status).toBe(200)
    const request = res.data.request
    expect(request.status).toBe('appointment')
    expectQuotingClient(request.client)
    expectQuotingVehicle(request.vehicle)
    expect(request.vehicle.licensePhotoUrl).toBeNull()
    // It learns that it lost — not who won, when, or for how much.
    expect(request.acceptedGarageId).toBeNull()
    expect(request.appointmentDate).toBeUndefined()
    expect(request.appointmentPrice).toBeUndefined()
    expectNoneOf(res.data, [...ownerSecrets(), winner.id])

    const offer = await offerFor(loser, mainRequest.requestId)
    expectQuotingClient(offer.serviceRequest.client as Record<string, unknown>)
    expectNoneOf(offer, ownerSecrets())

    // A garage that never bid has no history with this request at all.
    const stranger = await api(`/api/requests/${mainRequest.requestId}/`, { token: quoting.token })
    expect(stranger.status).toBe(403)
    expectNoneOf(stranger.data, ownerSecrets())
  })

  test('A garage whose booking was cancelled loses the client', async () => {
    const res = await api(`/api/requests/${cancelledRequest.requestId}/`, { token: cancelledGarage.token })
    expect(res.status).toBe(200)
    const request = res.data.request
    expect(request.status).toBe('cancelled')
    expectQuotingClient(request.client)
    expectQuotingVehicle(request.vehicle)
    expect(request.vehicle.licensePhotoUrl).toBeNull()
    expectNoneOf(res.data, ownerSecrets(CANCELLED_IDS))

    const offer = await offerFor(cancelledGarage, cancelledRequest.requestId)
    expectQuotingClient(offer.serviceRequest.client as Record<string, unknown>)
    expectNoneOf(offer, ownerSecrets(CANCELLED_IDS))
  })

  test('A client profile is readable by its owner only — no garage, no other client', async () => {
    for (const caller of [quoting, winner, loser, cancelledGarage, pendingGarage, otherClient]) {
      const res = await api(`/api/clients/${owner.id}/`, { token: caller.token })
      expect(res.status, `GET as ${caller.id}`).toBe(403)
      expectNoneOf(res.data, ownerSecrets())

      const cars = await api(`/api/clients/${owner.id}/vehicles/`, { token: caller.token })
      expect(cars.status, `vehicles as ${caller.id}`).toBe(403)
    }

    const edit = await api(`/api/clients/${owner.id}/`, {
      method: 'PUT',
      token: otherClient.token,
      body: { email: owner.email, firstName: 'Άλλος' },
    })
    expect(edit.status).toBe(403)

    const own = await api(`/api/clients/${owner.id}/`, { token: owner.token })
    expect(own.status).toBe(200)
    expect(own.data.client).toMatchObject({ email: owner.email, ...OWNER_PROFILE })

    // The owner's own request view is unchanged.
    const detail = await api(`/api/requests/${mainRequest.requestId}/`, { token: owner.token })
    expect(detail.data.request.client.phoneNumber).toBe(OWNER_PROFILE.phoneNumber)
    expect(detail.data.request.vehicle.licensePlate).toBe(MAIN_IDS.licensePlate)
    expect(detail.data.request.estimatedCost).toBe(ESTIMATE)
  })

  test("A garage's login email and ΑΦΜ are for its own settings screen only", async () => {
    for (const token of [undefined, loser.token, owner.token]) {
      const res = await api(`/api/garage/${winner.id}/`, { token })
      expect(res.status).toBe(200)
      // The shop card a client reads off an offer is still all there.
      expect(res.data.garage).toMatchObject({ id: winner.id, companyName: 'E2E P winner', mobile: '6900000000' })
      expect(res.data.garage.email).toBeUndefined()
      expect(res.data.garage.tin).toBeUndefined()
      expect(res.data.garage.taxAuthority).toBeUndefined()
    }

    const own = await api(`/api/garage/${winner.id}/`, { token: winner.token })
    expect(own.data.garage.email).toBe(winner.email)
    expect(own.data.garage.tin).toMatch(/^\d{9}$/)
    expect(own.data.garage.taxAuthority).toBe('ΔΟΥ Αθηνών')
  })

  test('The realtime fan-out to every garage carries the quoting view', async () => {
    test.skip(!(await isAppSyncMockReachable()), 'AppSync mock not reachable on :3002')

    const sub = await subscribeToChannels(['new-requests'], { token: await realtimeTokenFor(quoting.token) })
    try {
      const fresh = await newRequest(owner, LIVE_IDS, `E2E privacy live ${tag}`)
      const event = await sub.waitFor(
        (e) => e.data.__type === 'new-request' && e.data.request?.id === fresh.requestId,
        10_000
      )
      const request = event.data.request as Record<string, Record<string, unknown> | null>
      expectQuotingClient(request.client)
      expectQuotingVehicle(request.vehicle)
      expectNoneOf(event.data, ownerSecrets(LIVE_IDS))
    } finally {
      sub.close()
    }
  })

  test('UI: the feed names the client by first name, or «Πελάτης» — never "undefined"', async ({ page }) => {
    await signInGarage(page, quoting)
    await page.goto(`/garage-dashboard/${quoting.id}/?tab=requests`)
    await expect(page.getByRole('heading', { name: 'Νέα Αιτήματα' })).toBeVisible({ timeout: 45_000 })

    const named = page.locator('article').filter({ hasText: `E2E privacy live ${tag}` })
    const unnamed = page.locator('article').filter({ hasText: `E2E privacy unnamed ${tag}` })
    await expect(named).toBeVisible({ timeout: 30_000 })
    await expect(named).toContainText(OWNER_PROFILE.firstName)
    await expect(unnamed).toContainText('Πελάτης')
    for (const card of [named, unnamed]) {
      await expect(card).not.toContainText('undefined')
      await expect(card).not.toContainText(OWNER_PROFILE.lastName)
      await expect(card).not.toContainText(OWNER_PROFILE.phoneNumber)
    }
    await expect(unnamed).not.toContainText(otherClient.email.split('@')[0])
  })

  test('UI: the offer page tells a quoting garage what estimate the client saw', async ({ page }) => {
    await signInGarage(page, quoting)
    await page.goto(`/garage-dashboard/${quoting.id}/offers/${unnamedRequest.requestId}/`)
    // Read off `request.estimatedCost`, which the garage's view never carried.
    await expect(page.getByText(`Ο πελάτης είδε ενδεικτική εκτίμηση από ${ESTIMATE}€`)).toBeVisible({ timeout: 45_000 })
  })

  test('UI: the winner gets the contact details on its appointment', async ({ page }) => {
    await signInGarage(page, winner)
    await page.goto(`/garage-dashboard/${winner.id}/?tab=appointments`)
    const card = page.locator('article').filter({ hasText: `E2E privacy main ${tag}` })
    await expect(card).toBeVisible({ timeout: 45_000 })
    await expect(card).toContainText(`${OWNER_PROFILE.firstName} ${OWNER_PROFILE.lastName}`)
    await expect(card).toContainText(MAIN_IDS.licensePlate)
    await expect(card.getByRole('link', { name: 'Κλήση πελάτη' })).toHaveAttribute('href', `tel:${OWNER_PROFILE.phoneNumber}`)
    await expect(card.getByRole('link', { name: 'Email στον πελάτη' })).toHaveAttribute('href', `mailto:${owner.email}`)
  })

  // Its own browser context: switching garages inside one would hit the
  // dashboard's stale-identity redirect, not the screen under test.
  test('UI: the losing garage sees the first name on its offer, and no contact buttons', async ({ page }) => {
    await signInGarage(page, loser)
    await page.goto(`/garage-dashboard/${loser.id}/?tab=offers`)
    const lost = page.locator('article').filter({ hasText: `E2E privacy main ${tag}` })
    await expect(lost).toBeVisible({ timeout: 45_000 })
    await expect(lost).toContainText(OWNER_PROFILE.firstName)
    await expect(lost).not.toContainText(OWNER_PROFILE.lastName)
    await expect(lost).not.toContainText('undefined')
    await expect(lost.locator('a[href^="tel:"]')).toHaveCount(0)
    await expect(lost).toContainText('Απορρίφθηκε')
  })

  test('UI: a booking the client cancelled reads «Ακυρώθηκε», with the first name only', async ({ page }) => {
    await signInGarage(page, cancelledGarage)
    await page.goto(`/garage-dashboard/${cancelledGarage.id}/?tab=offers`)
    const card = page.locator('article').filter({ hasText: `E2E privacy cancelled ${tag}` })
    await expect(card).toBeVisible({ timeout: 45_000 })
    // The job was called off; nobody turned the quote down.
    await expect(card).toContainText('Ακυρώθηκε')
    await expect(card).not.toContainText('Απορρίφθηκε')
    await expect(card).toContainText(OWNER_PROFILE.firstName)
    await expect(card).not.toContainText(OWNER_PROFILE.lastName)
    await expect(card).not.toContainText('undefined')
    await expect(card.locator('a[href^="tel:"]')).toHaveCount(0)

    // The "Απορρίφθηκε" chip gathers every offer that ended without a booking.
    await page.getByRole('button', { name: 'Απορρίφθηκε' }).click()
    await expect(card).toBeVisible()
    await page.getByRole('button', { name: 'Εκκρεμής' }).click()
    await expect(card).toBeHidden()
  })

  test('A completed job stays the winner’s; the loser never reads its invoice', async () => {
    await ageAppointment(mainRequest.requestId, winnerOfferId)
    const done = await api(`/api/requests/${mainRequest.requestId}/complete/`, {
      method: 'POST',
      token: winner.token,
      body: { outcome: 'completed', amount: 186, vatIncluded: true },
    })
    expect(done.status, JSON.stringify(done.data)).toBe(200)

    const detail = await api(`/api/requests/${mainRequest.requestId}/`, { token: winner.token })
    expect(detail.data.request.status).toBe('completed')
    expect(detail.data.request.client.phoneNumber).toBe(OWNER_PROFILE.phoneNumber)

    const won = await offerFor(winner, mainRequest.requestId)
    expect(won.serviceRequest.finalAmounts).toBeTruthy()

    const lost = await offerFor(loser, mainRequest.requestId)
    expect(lost.serviceRequest.status).toBe('completed')
    expect(lost.serviceRequest.finalAmounts).toBeUndefined()
    expect(lost.serviceRequest.completionOutcome).toBeUndefined()
    expectQuotingClient(lost.serviceRequest.client as Record<string, unknown>)
  })
})
