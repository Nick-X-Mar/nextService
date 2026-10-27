import { test, expect, type BrowserContext } from '@playwright/test'
import {
  addRequest,
  ageMergeLink,
  api,
  createClientWithRequest,
  getRow,
  makeLegacyGuest,
  plantMergeToken,
  setClientFields,
} from './a-helpers'
import { getReview, hoursAgo, putReview, setFields } from './r-helpers'
import { TEST_GARAGE } from './helpers'
import { newGarage, postMessage } from './E-helpers'

/**
 * A guest (a session whose Clients row has no credentials) folding its requests
 * into an existing account.
 *
 * The route this replaces merged into whatever account owned the email it was
 * given, rewrote that account's name and phone, deleted the row named by a
 * body field, and signed the caller in as the account's owner — for anyone,
 * with no password and no session.
 */

const stamp = Date.now()
const PASSWORD = 'TestPass123'
const email = (tag: string) => `e2e-merge-${tag}-${stamp}@test.com`

async function addSessionCookie(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: 'auth-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
}

async function newGuest(tag: string, vehicle: Record<string, unknown> = {}) {
  const guest = await createClientWithRequest(email(`guest-${tag}`), PASSWORD, vehicle)
  await makeLegacyGuest(guest.clientId)
  return guest
}

test.describe.serial('Guest → account merge', () => {
  let victim: Awaited<ReturnType<typeof createClientWithRequest>>
  let victimBefore: Record<string, unknown>
  let attacker: Awaited<ReturnType<typeof newGuest>>

  test('Setup: a victim account and an attacker guest', async () => {
    victim = await createClientWithRequest(email('victim'), PASSWORD)
    await setClientFields(victim.clientId, { lastName: 'Παπαδοπούλου', phoneNumber: '6900000001' })
    victimBefore = (await getRow('Clients', victim.clientId))!
    attacker = await newGuest('attacker')
  })

  const expectVictimUntouched = async () => {
    const row = await getRow('Clients', victim.clientId)
    expect(row).toBeTruthy()
    expect(row!.firstName).toBe(victimBefore.firstName)
    expect(row!.lastName).toBe(victimBefore.lastName)
    expect(row!.phoneNumber).toBe(victimBefore.phoneNumber)
    expect(row!.passwordHash).toBe(victimBefore.passwordHash)
    expect((await getRow('ServiceRequests', victim.requestId))?.clientId).toBe(victim.clientId)
  }

  test('Attack: victim email + any guestClientId, no session → nothing happens', async () => {
    const res = await api('/api/auth/register-from-requests/', {
      method: 'POST',
      body: {
        guestClientId: attacker.clientId,
        email: email('victim'),
        firstName: 'Κακόβουλος',
        phoneNumber: '6999999999',
      },
    })
    expect(res.status).toBe(401)
    expect(res.authToken).toBeNull()
    await expectVictimUntouched()
    expect(await getRow('Clients', attacker.clientId)).toBeTruthy()
  })

  test("Attack: the attacker's own guest session + victim email → no victim session, no changes", async () => {
    const res = await api('/api/auth/register-from-requests/', {
      method: 'POST',
      cookie: attacker.token,
      body: { email: email('victim'), firstName: 'Κακόβουλος', phoneNumber: '6999999999', password: PASSWORD, acceptedTerms: true },
    })
    expect(res.status).toBe(409)
    expect(res.data.code).toBe('EMAIL_EXISTS')
    expect(res.authToken).toBeNull()
    await expectVictimUntouched()

    // Nothing deleted, nothing moved: the guest is still a guest with its request.
    const guestRow = await getRow('Clients', attacker.clientId)
    expect(guestRow).toBeTruthy()
    expect(guestRow!.email).toBeUndefined()
    expect(guestRow!.mergedInto).toBeUndefined()
    expect((await getRow('ServiceRequests', attacker.requestId))?.clientId).toBe(attacker.clientId)
  })

  test("Another client's id as guestClientId is rejected", async () => {
    for (const cookie of [attacker.token, undefined]) {
      const res = await api('/api/auth/register-from-requests/', {
        method: 'POST',
        cookie,
        body: { guestClientId: victim.clientId, email: email('fresh-target'), password: PASSWORD, acceptedTerms: true },
      })
      expect([401, 403]).toContain(res.status)
      expect(res.authToken).toBeNull()
    }
    // Also through the merge endpoints.
    for (const path of ['merge-with-password', 'send-confirmation']) {
      const res = await api(`/api/auth/register-from-requests/${path}/`, {
        method: 'POST',
        cookie: attacker.token,
        body: { guestClientId: victim.clientId, email: email('victim'), password: PASSWORD },
      })
      expect(res.status).toBe(403)
      expect(res.authToken).toBeNull()
    }
    await expectVictimUntouched()
    // The victim never gained an email-less twin, and was not overwritten.
    expect((await getRow('Clients', victim.clientId))!.email).toBe(email('victim'))
  })

  test('A registered account cannot be rewritten through this route', async () => {
    const res = await api('/api/auth/register-from-requests/', {
      method: 'POST',
      cookie: victim.token,
      body: { email: email('victim-renamed'), password: PASSWORD, acceptedTerms: true },
    })
    expect(res.status).toBe(409)
    expect(res.data.code).toBe('NOT_GUEST')
    expect((await getRow('Clients', victim.clientId))!.email).toBe(email('victim'))
  })

  test('Password path: a wrong password is rejected and moves nothing', async () => {
    const res = await api('/api/auth/register-from-requests/merge-with-password/', {
      method: 'POST',
      cookie: attacker.token,
      body: { email: email('victim'), password: 'not-the-password' },
    })
    expect(res.status).toBe(401)
    expect(res.authToken).toBeNull()
    expect((await getRow('ServiceRequests', attacker.requestId))?.clientId).toBe(attacker.clientId)
    expect((await getRow('Clients', attacker.clientId))!.mergedInto).toBeUndefined()
    await expectVictimUntouched()
  })

  test('Password path: the right password merges, de-dupes the car and switches the session', async () => {
    const vin = `E2EVIN${stamp}`.slice(0, 17)
    const owner = await createClientWithRequest(email('owner-pw'), PASSWORD, { vinNumber: vin })
    const guest = await newGuest('pw', { vinNumber: vin.toLowerCase(), licensePlate: 'ΙΚΧ1234' })
    const extra = await addRequest(guest.token, { brand: 'Fiat', model: 'Panda', vinNumber: `OTHER${stamp}`.slice(0, 17) })

    const res = await api('/api/auth/register-from-requests/merge-with-password/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email('owner-pw'), password: PASSWORD },
    })
    expect(res.status).toBe(200)
    expect(res.authToken).toBeTruthy()
    expect(res.data.vehicleDeduplicated).toBe(true)

    // The new cookie is the account's.
    const me = await api('/api/auth/me/', { cookie: res.authToken! })
    expect((me.data.user as { id: string }).id).toBe(owner.clientId)

    // Same car → the request now points at the owner's vehicle, which picked up
    // the plate only the guest knew; the duplicate is gone.
    const movedSame = await getRow('ServiceRequests', guest.requestId)
    expect(movedSame?.clientId).toBe(owner.clientId)
    expect(movedSame?.vehicleId).toBe(owner.vehicleId)
    expect(await getRow('Vehicles', guest.vehicleId)).toBeUndefined()
    expect((await getRow('Vehicles', owner.vehicleId))?.licensePlate).toBe('ΙΚΧ1234')

    // A different car moves across as it is.
    const movedOther = await getRow('ServiceRequests', extra.requestId)
    expect(movedOther?.clientId).toBe(owner.clientId)
    expect(movedOther?.vehicleId).toBe(extra.vehicleId)
    expect((await getRow('Vehicles', extra.vehicleId))?.clientId).toBe(owner.clientId)

    // The guest row is a tombstone, and its old session is over.
    const tomb = await getRow('Clients', guest.clientId)
    expect(tomb?.mergedInto).toBe(owner.clientId)
    expect(tomb?.mergedAt).toBeTruthy()
    const ghost = await api('/api/auth/me/', { cookie: guest.token })
    expect(ghost.status).toBe(401)
  })

  test('Email path: the token is single-use, expires, and a re-send replaces it', async () => {
    const owner = await createClientWithRequest(email('owner-mail'), PASSWORD)
    const guest = await newGuest('mail')

    const sent = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email('owner-mail') },
    })
    expect(sent.status).toBe(200)
    expect(sent.authToken).toBeNull()

    // What the app persisted: only a hash, aimed at the owner, valid for an hour.
    const { token: expiredToken, stored } = await plantMergeToken(guest.clientId)
    expect(stored.mergeTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.mergeTargetId).toBe(owner.clientId)
    const ttl = new Date(String(stored.mergeExpiresAt)).getTime() - Date.now()
    expect(ttl).toBeGreaterThan(55 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000)

    const pending = await api('/api/auth/register-from-requests/status/', { cookie: guest.token })
    expect(pending.data).toEqual({ status: 'pending' })

    // Expired.
    await ageMergeLink(guest.clientId)
    const late = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token: expiredToken },
    })
    expect(late.status).toBe(410)
    expect(late.data.code).toBe('EXPIRED')
    expect(late.authToken).toBeNull()
    expect((await api('/api/auth/register-from-requests/status/', { cookie: guest.token })).data).toEqual({
      status: 'expired',
    })
    expect((await getRow('ServiceRequests', guest.requestId))?.clientId).toBe(guest.clientId)

    // A re-send mints a new link; the old one is dead even though it is "known".
    const resent = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email('owner-mail') },
    })
    expect(resent.status).toBe(200)
    const stale = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token: expiredToken },
    })
    expect(stale.status).toBe(400)
    expect(stale.authToken).toBeNull()

    // Used once…
    const { token } = await plantMergeToken(guest.clientId)
    const first = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token },
    })
    expect(first.status).toBe(200)
    expect(first.authToken).toBeTruthy()
    expect((await getRow('ServiceRequests', guest.requestId))?.clientId).toBe(owner.clientId)
    expect((await getRow('Clients', guest.clientId))?.mergedInto).toBe(owner.clientId)

    // …and never again.
    const second = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token },
    })
    expect(second.status).toBe(410)
    expect(second.data.code).toBe('ALREADY_USED')
    expect(second.authToken).toBeNull()

    // The guest's own session learns the outcome and nothing more.
    const status = await api('/api/auth/register-from-requests/status/', { cookie: guest.token })
    expect(status.data).toEqual({ status: 'merged' })
  })

  test('UI: the waiting tab learns a merge confirmed on another device', async ({ browser }) => {
    const owner = await createClientWithRequest(email('owner-elsewhere'), PASSWORD)
    const guest = await newGuest('elsewhere')

    const context = await browser.newContext()
    await addSessionCookie(context, guest.token)
    const page = await context.newPage()
    await page.goto(`/requests/${guest.clientId}/`)

    // Register with an address that already has an account → the modal.
    await page.getByTestId('guest-registration').getByRole('button', { name: 'Ολοκλήρωση εγγραφής' }).click()
    await page.locator('#guest-email').fill(email('owner-elsewhere'))
    await page.locator('#guest-password').fill(PASSWORD)
    await page.locator('#guest-password-confirm').fill(PASSWORD)
    await page.getByTestId('guest-registration').locator('input[type="checkbox"]').check()
    await page.getByTestId('guest-registration').getByRole('button', { name: 'Ολοκλήρωση εγγραφής' }).click()

    const modal = page.getByTestId('guest-merge-modal')
    await expect(modal).toBeVisible()
    await expect(modal.locator('#merge-email')).toHaveValue(email('owner-elsewhere'))
    await modal.getByRole('button', { name: 'Στείλε μου email επιβεβαίωσης' }).click()
    await expect(page.getByTestId('guest-merge-waiting')).toBeVisible()
    await expect(page.getByTestId('guest-merge-waiting')).toContainText(email('owner-elsewhere'))

    // Confirmed from a different browser — no cookies shared with this one.
    const { token } = await plantMergeToken(guest.clientId)
    const confirmed = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token },
    })
    expect(confirmed.status).toBe(200)

    // The guest session is dropped and the tab moves to a public sign-in page
    // (its own page sat behind that session).
    await expect(page).toHaveURL(/\/confirm-account\/\?merged=1$/, { timeout: 15_000 })
    const done = page.getByTestId('guest-merge-confirmed')
    await expect(done).toContainText('Ο λογαριασμός επιβεβαιώθηκε')
    await expect(done.locator('#merged-login-email')).toHaveValue(email('owner-elsewhere'))
    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === 'auth-token')?.value || '').toBe('')

    // …and signing in lands on the account's requests.
    await done.locator('#merged-login-password').fill(PASSWORD)
    await done.getByRole('button', { name: 'Σύνδεση' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${owner.clientId}/$`), { timeout: 15_000 })
    await context.close()
  })

  test('UI: opening the link in the same browser switches the waiting tab automatically', async ({ browser }) => {
    const owner = await createClientWithRequest(email('owner-same'), PASSWORD)
    const guest = await newGuest('same')

    const context = await browser.newContext()
    await addSessionCookie(context, guest.token)
    const waiting = await context.newPage()
    await waiting.goto(`/requests/${guest.clientId}/`)

    await waiting.getByTestId('guest-registration').getByRole('button', { name: 'Έχω ήδη λογαριασμό' }).click()
    const modal = waiting.getByTestId('guest-merge-modal')
    await modal.locator('#merge-email').fill(email('owner-same'))
    await modal.getByRole('button', { name: 'Στείλε μου email επιβεβαίωσης' }).click()
    await expect(waiting.getByTestId('guest-merge-waiting')).toBeVisible()

    // The "email" opens in a second tab of the same browser.
    const { token } = await plantMergeToken(guest.clientId)
    const mail = await context.newPage()
    await mail.goto(`/confirm-account/?g=${guest.clientId}&t=${token}`)
    // Nothing is spent by merely opening the page (mail scanners do that).
    expect((await getRow('Clients', guest.clientId))?.mergedInto).toBeUndefined()
    await mail.getByRole('button', { name: 'Επιβεβαίωση' }).click()
    await expect(mail.getByTestId('confirm-account-done')).toBeVisible()

    // Back on the waiting tab: it notices the session is now the account's.
    await waiting.bringToFront()
    await waiting.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(waiting).toHaveURL(new RegExp(`/requests/${owner.clientId}/$`), { timeout: 15_000 })
    await expect(waiting.getByText('Τα Αιτήματά μου')).toBeVisible()

    // The link is spent.
    await mail.goto(`/confirm-account/?g=${guest.clientId}&t=${token}`)
    await mail.getByRole('button', { name: 'Επιβεβαίωση' }).click()
    await expect(mail.getByTestId('confirm-account-failed')).toContainText('έχει ήδη χρησιμοποιηθεί')
    await context.close()
  })

  test('UI: a free email completes the guest registration in place', async ({ browser }) => {
    const guest = await newGuest('free')
    const context = await browser.newContext()
    await addSessionCookie(context, guest.token)
    const page = await context.newPage()
    await page.goto(`/requests/${guest.clientId}/`)

    await page.getByTestId('guest-registration').getByRole('button', { name: 'Ολοκλήρωση εγγραφής' }).click()
    await page.locator('#guest-first-name').fill('Μαρία')
    await page.locator('#guest-email').fill(email('free-new'))
    await page.locator('#guest-password').fill(PASSWORD)
    await page.locator('#guest-password-confirm').fill(PASSWORD)
    await page.getByTestId('guest-registration').locator('input[type="checkbox"]').check()
    await page.getByTestId('guest-registration').getByRole('button', { name: 'Ολοκλήρωση εγγραφής' }).click()
    await expect(page.getByTestId('guest-registration')).toBeHidden()

    const row = await getRow('Clients', guest.clientId)
    expect(row?.email).toBe(email('free-new'))
    expect(row?.firstName).toBe('Μαρία')
    expect(row?.acceptedTermsAt).toBeTruthy()
    const login = await api('/api/auth/login/', {
      method: 'POST',
      body: { email: email('free-new'), password: PASSWORD, userType: 'client' },
    })
    expect(login.status).toBe(200)
    await context.close()
  })
})

/**
 * The edges of the merge: what it must leave alone, what it must carry, and
 * how long a link stays good when the merge behind it broke off.
 */
test.describe.serial('Guest → account merge: edge cases', () => {
  const tag = (t: string) => `edge-${t}`

  test("Registering keeps the guest's own name; the placeholder never becomes the email", async () => {
    // A guest whose old funnel row carries a real name.
    const named = await newGuest(tag('named'))
    await setClientFields(named.clientId, { firstName: 'Γιώργος' })
    const kept = await api('/api/auth/register-from-requests/', {
      method: 'POST',
      cookie: named.token,
      body: { email: email(tag('named-new')), password: PASSWORD, acceptedTerms: true },
    })
    expect(kept.status).toBe(200)
    expect((await getRow('Clients', named.clientId))?.firstName).toBe('Γιώργος')

    // One still on the placeholder keeps it — garages see the first name
    // before they win a job, so it is not filled from the address.
    const placeholder = await newGuest(tag('placeholder'))
    const res = await api('/api/auth/register-from-requests/', {
      method: 'POST',
      cookie: placeholder.token,
      body: { email: email(tag('placeholder-new')), password: PASSWORD, acceptedTerms: true },
    })
    expect(res.status).toBe(200)
    const row = await getRow('Clients', placeholder.clientId)
    expect(row?.firstName).toBe('Επισκέπτης')
    expect(row?.firstName).not.toBe(email(tag('placeholder-new')).split('@')[0])
  })

  test('A merge carries reviews, the rating aggregate and the wallet — exactly once', async () => {
    const owner = await createClientWithRequest(email(tag('totals-owner')), PASSWORD)
    await setFields('Clients', { id: owner.clientId }, { ratingCount: 1, ratingSum: 5, walletBalance: 10 })
    const guest = await newGuest(tag('totals'))
    const about = await putReview({
      requestId: guest.requestId,
      clientId: guest.clientId,
      garageId: TEST_GARAGE.id,
      direction: 'garage_to_client',
      rating: 4,
    })
    const by = await putReview({
      requestId: guest.requestId,
      clientId: guest.clientId,
      garageId: TEST_GARAGE.id,
      direction: 'client_to_garage',
      rating: 5,
    })
    await setFields('Clients', { id: guest.clientId }, { ratingCount: 2, ratingSum: 9, walletBalance: 15 })

    // Two merges racing for the same account — the retry case, compressed.
    const merge = () =>
      api('/api/auth/register-from-requests/merge-with-password/', {
        method: 'POST',
        cookie: guest.token,
        body: { email: email(tag('totals-owner')), password: PASSWORD },
      })
    const results = await Promise.all([merge(), merge()])
    expect(results.some((r) => r.status === 200)).toBe(true)

    expect((await getReview(about))?.clientId).toBe(owner.clientId)
    expect((await getReview(by))?.clientId).toBe(owner.clientId)
    const account = await getRow('Clients', owner.clientId)
    expect(account?.ratingCount).toBe(3)
    expect(account?.ratingSum).toBe(14)
    expect(account?.walletBalance).toBe(25)
    const tomb = await getRow('Clients', guest.clientId)
    expect(tomb?.mergedInto).toBe(owner.clientId)
    expect(tomb?.ratingCount).toBeUndefined()
    expect(tomb?.walletBalance).toBeUndefined()
  })

  test('A link opened in time can finish a broken-off merge — but not a day later', async () => {
    const owner = await createClientWithRequest(email(tag('ceiling-owner')), PASSWORD)
    const guest = await newGuest(tag('ceiling'))
    const sent = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email(tag('ceiling-owner')) },
    })
    expect(sent.status).toBe(200)
    const { token } = await plantMergeToken(guest.clientId)

    // Opened 25 hours ago, the merge died right after it claimed the guest.
    await setFields('Clients', { id: guest.clientId }, {
      mergeRequestedAt: hoursAgo(25.5),
      mergeExpiresAt: hoursAgo(24.5),
      mergeConfirmedAt: hoursAgo(25),
      mergingInto: owner.clientId,
      mergeClaimedAt: hoursAgo(25),
    })
    const late = await api('/api/auth/confirm-account/', { method: 'POST', body: { guestId: guest.clientId, token } })
    expect(late.status).toBe(410)
    expect(late.data.code).toBe('EXPIRED')
    expect(late.authToken).toBeNull()
    expect((await getRow('ServiceRequests', guest.requestId))?.clientId).toBe(guest.clientId)
    // The waiting page is told, and offers a new link…
    expect((await api('/api/auth/register-from-requests/status/', { cookie: guest.token })).data).toEqual({
      status: 'expired',
    })

    // …which the dead claim does not block, and which finishes the job.
    const resent = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email(tag('ceiling-owner')) },
    })
    expect(resent.status).toBe(200)
    const fresh = await plantMergeToken(guest.clientId)
    // Opened two hours ago — past the hour, inside the day: still good.
    await setFields('Clients', { id: guest.clientId }, {
      mergeExpiresAt: hoursAgo(1),
      mergeConfirmedAt: hoursAgo(2),
      mergeClaimedAt: hoursAgo(2),
    })
    const finished = await api('/api/auth/confirm-account/', {
      method: 'POST',
      body: { guestId: guest.clientId, token: fresh.token },
    })
    expect(finished.status).toBe(200)
    expect(finished.authToken).toBeTruthy()
    expect((await getRow('ServiceRequests', guest.requestId))?.clientId).toBe(owner.clientId)
  })

  test('While a merge into that account is running, a re-send says so', async () => {
    const owner = await createClientWithRequest(email(tag('running-owner')), PASSWORD)
    const guest = await newGuest(tag('running'))
    await setFields('Clients', { id: guest.clientId }, {
      mergingInto: owner.clientId,
      mergeClaimedAt: new Date().toISOString(),
    })
    const res = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email(tag('running-owner')) },
    })
    expect(res.status).toBe(409)
    expect(res.data.code).toBe('MERGE_RUNNING')
    expect(String(res.data.error)).toContain('σε εξέλιξη')
    expect((await api('/api/auth/register-from-requests/status/', { cookie: guest.token })).data).toEqual({
      status: 'pending',
    })

    // Another account's merge still answers as before.
    const other = await createClientWithRequest(email(tag('running-other')), PASSWORD)
    const elsewhere = await api('/api/auth/register-from-requests/send-confirmation/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email(tag('running-other')) },
    })
    expect(elsewhere.status).toBe(409)
    expect(elsewhere.data.code).toBe('MERGE_IN_PROGRESS')
    expect(other.clientId).toBeTruthy()
  })

  test("A request still carrying the guest's cookie after the merge does not put it back", async () => {
    const owner = await createClientWithRequest(email(tag('cookie-owner')), PASSWORD)
    const guest = await newGuest(tag('cookie'))
    const merged = await api('/api/auth/register-from-requests/merge-with-password/', {
      method: 'POST',
      cookie: guest.token,
      body: { email: email(tag('cookie-owner')), password: PASSWORD },
    })
    expect(merged.status).toBe(200)
    expect(merged.authToken).toBeTruthy()

    // The guest tab's 30s notifications poll, answered after the merge. Its
    // response used to re-issue the guest cookie over the account's.
    const straggler = await api('/api/notifications/summary/', { cookie: guest.token })
    expect(straggler.authToken).toBeNull()
    const page = await api(`/requests/${guest.clientId}/`, { cookie: guest.token })
    expect(page.authToken).toBeNull()
    expect(owner.clientId).toBeTruthy()
  })

  test('UI: after a merge in this tab, live chat works for the account', async ({ browser, request }) => {
    // The realtime token used to be cached for the life of the page. A guest
    // who had opened a chat, merged and walked on into the account's chat
    // kept presenting the guest's token, and the authorizer — rightly —
    // refused the account's threads: no message arrived until a reload.
    const owner = await createClientWithRequest(email(tag('live-owner')), PASSWORD)
    const guest = await newGuest(tag('live'))
    const garage = await newGarage(request, { prefix: 'merge-live' })
    await postMessage(request, garage.token, guest.requestId, `Πριν τη μεταφορά ${Date.now()}`, garage.id)

    const context = await browser.newContext()
    await addSessionCookie(context, guest.token)
    const page = await context.newPage()

    // As the guest: a chat open, so the tab holds a realtime token.
    const guestToken = page.waitForResponse((r) => r.url().includes('/api/realtime/token') && r.status() === 200)
    await page.goto(`/requests/${guest.clientId}/chats/${guest.requestId}/?garageId=${garage.id}`)
    await guestToken

    // In-app to the requests page, and merge with the account's password.
    await page.locator('aside').getByRole('link', { name: /Αιτήματα$/ }).click()
    await page.getByTestId('guest-registration').getByRole('button', { name: 'Έχω ήδη λογαριασμό' }).click()
    const modal = page.getByTestId('guest-merge-modal')
    await modal.locator('#merge-email').fill(email(tag('live-owner')))
    await modal.locator('#merge-password').fill(PASSWORD)
    await modal.getByRole('button', { name: 'Σύνδεση με κωδικό' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${owner.clientId}/$`), { timeout: 15_000 })

    // In-app again (no reload), into the moved request's conversation.
    await page.getByRole('button', { name: 'Συνομιλία' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/requests/${owner.clientId}/chats/${guest.requestId}/`), { timeout: 15_000 })
    // `.last()`: the thread list previews the same text above the conversation.
    await expect(page.getByText(/Πριν τη μεταφορά/).last()).toBeVisible({ timeout: 20_000 })

    const live = `Μετά τη μεταφορά ${Date.now()}`
    await postMessage(request, garage.token, guest.requestId, live, garage.id)
    await expect(page.getByText(live).last()).toBeVisible({ timeout: 10_000 })
    await context.close()
  })
})
