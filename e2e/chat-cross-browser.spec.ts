import { test, expect } from '@playwright/test'
import { registerClient, loginViaAPI, loginAsClient, TEST_GARAGE } from './helpers'

/**
 * The reported bug, as a test: "in browsers other than Chrome the chat is slow
 * to load and when I write something I don't see it — I have to refresh."
 *
 * Runs on Chromium, Firefox and WebKit. The failure was never a missing browser
 * API — it was timing. The client chat used to throw away the POST response and
 * refetch from a GSI, which DynamoDB does not serve consistently, then *replace*
 * the message list with whatever came back. Chrome usually won that race; the
 * other engines usually lost it, and the message the user had just sent
 * disappeared until reload.
 *
 * So the assertion that matters is: after sending, the message is on screen,
 * with no reload and no dependency on the realtime echo.
 */

const PASSWORD = 'TestPass123'

test.describe('Chat across browser engines', () => {
  test('A sent message appears immediately, without a reload', async ({ page, request, browserName }) => {
    const email = `e2e-xb-${browserName}-${Date.now()}@test.com`
    const reg = await registerClient(request, email, PASSWORD)
    const clientId: string = reg.client.id

    const clientToken = (await loginViaAPI(request, email, PASSWORD, 'client')).token
    const srResp = await request.post('/api/service-request', {
      headers: { Cookie: `auth-token=${clientToken}` },
      data: {
        clientId,
        category: 'allagi-ladion',
        description: 'E2E cross-browser chat',
        brand: 'Opel',
        model: 'Corsa',
        modelYear: '2017',
        engineCC: '1200',
        fuelType: 'petrol',
        isAutomatic: false,
        is4x4: false,
      },
    })
    expect(srResp.status()).toBe(200)
    const requestId: string = (await srResp.json()).serviceRequestId

    // A garage has to speak first — that is what creates the client-side thread.
    const garageToken = (await loginViaAPI(request, TEST_GARAGE.email, TEST_GARAGE.password, 'garage')).token
    const seed = await request.post(`/api/chat/${requestId}/messages/`, {
      headers: { Cookie: `auth-token=${garageToken}` },
      data: { message: 'Καλησπέρα, πείτε μου για το όχημα.', garageId: TEST_GARAGE.id },
    })
    expect(seed.status()).toBe(200)

    await loginAsClient(page, request, email, PASSWORD)

    const started = Date.now()
    await page.goto(`/requests/${clientId}/chats/${requestId}/`)

    const composer = page.getByPlaceholder('Γράψτε μήνυμα...')
    await expect(composer).toBeVisible({ timeout: 20_000 })
    const loadMs = Date.now() - started

    // The garage's seeded message must be there once the thread opens. The
    // same text also appears in the thread-list preview on wide viewports, so
    // match the conversation bubble specifically.
    const bubble = (text: string) => page.locator('p.text-sm.leading-relaxed', { hasText: text })
    await expect(bubble('Καλησπέρα, πείτε μου για το όχημα.')).toBeVisible()

    const mine = `Δικό μου μήνυμα ${browserName} ${Date.now()}`
    await composer.fill(mine)
    await composer.press('Enter')

    // No reload, no realtime echo required.
    await expect(bubble(mine)).toBeVisible({ timeout: 10_000 })

    // And it survives a reload, i.e. it really was persisted.
    await page.reload()
    await expect(bubble(mine)).toBeVisible({ timeout: 20_000 })

    console.log(`[${browserName}] chat became interactive in ${loadMs}ms`)
    // Generous, but it catches the "spinner for ages" regression: this used to
    // wait on an unbounded Query of every message on the request.
    expect(loadMs).toBeLessThan(20_000)
  })
})
