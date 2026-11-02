import { test, expect } from '@playwright/test'
import { emailsTo } from './E-helpers'
import { acceptOffer, api, makeOffer, newClient, newGarage, newRequest, unique, type Party } from './p-helpers'

/**
 * A client's edit reaches the garages working on the request by email: the ones
 * with a live offer, and the one that holds the job. The email names what changed,
 * never the new value, and a garage hears nothing about what it may not see.
 */

const TEMPLATE = 'request_details_changed'
const n = unique().replace(/\D/g, '').slice(-8)

const sent = async (garage: Party) => (await emailsTo(garage.email, TEMPLATE)).length
const expectEmails = (garage: Party, count: number) =>
  expect.poll(() => sent(garage), { timeout: 10_000 }).toBe(count)

test.describe.serial('Client edits reach the garages', () => {
  let client: Party
  let quoting: Party
  let winner: Party
  let silent: Party
  let requestId: string
  let vehicleId: string
  let winnerOfferId: string

  const editVehicle = async (data: Record<string, unknown>) => {
    const res = await api(`/api/vehicles/${vehicleId}/`, { method: 'PATCH', token: client.token, body: data })
    expect(res.status, JSON.stringify(res.data)).toBe(200)
  }

  test('Setup: two garages quote, a third only looks', async () => {
    ;[client, quoting, winner, silent] = await Promise.all([
      newClient('changes'),
      newGarage('changes-quoting'),
      newGarage('changes-winner'),
      newGarage('changes-silent'),
    ])
    const created = await newRequest(client, { licensePlate: `CHG-${n.slice(-4)}`, vinNumber: `VINCHG${n}`, engineNumber: `ENGCHG${n}` })
    requestId = created.requestId
    vehicleId = created.vehicleId
    await makeOffer(quoting, requestId)
    winnerOfferId = await makeOffer(winner, requestId)
  })

  test('A car field: every garage with an offer hears what changed, with a link', async () => {
    await editVehicle({ vinNumber: `VINNEW${n}`, color: 'Κόκκινο' })
    await expectEmails(quoting, 1)
    await expectEmails(winner, 1)
    expect(await sent(silent)).toBe(0)

    const [email] = await emailsTo(quoting.email, TEMPLATE)
    expect(email.subject).toContain('Peugeot 208')
    expect(email.garageId).toBe(quoting.id)
    expect(email.requestId).toBe(requestId)
  })

  test('Saving the same values sends nothing', async () => {
    await editVehicle({ vinNumber: `VINNEW${n}`, color: 'Κόκκινο', isTurbo: true })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await sent(quoting)).toBe(1)
  })

  test('The plate is winner-only, so a quoting garage is not told it changed', async () => {
    await editVehicle({ licensePlate: `NEW-${n.slice(-4)}` })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await sent(quoting)).toBe(1)
    expect(await sent(winner)).toBe(1)
  })

  test('After the booking only the garage that holds the job hears, contact details included', async () => {
    await acceptOffer(client, requestId, winnerOfferId)

    await editVehicle({ color: 'Μαύρο' })
    await expectEmails(winner, 2)

    const res = await api(`/api/clients/${client.id}/`, {
      method: 'PUT',
      token: client.token,
      body: { email: client.email, firstName: 'Ελένη', phoneNumber: `69${n}` },
    })
    expect(res.status, JSON.stringify(res.data)).toBe(200)
    await expectEmails(winner, 3)
    expect(await sent(quoting)).toBe(1)
  })

  test('A cancelled booking is nobody\'s to hear about', async () => {
    const cancel = await api(`/api/requests/${requestId}/cancel/`, { method: 'PATCH', token: client.token })
    expect(cancel.status, JSON.stringify(cancel.data)).toBe(200)
    await editVehicle({ color: 'Λευκό' })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await sent(winner)).toBe(3)
  })
})
