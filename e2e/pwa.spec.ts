import { test, expect, type Page } from '@playwright/test'
import { createECDH, randomBytes } from 'crypto'
import { cookie, newClient, newGarage, signInGarage } from './E-helpers'
import { newGuest } from './b-helpers'
import { pushSubscriptionsOf } from './dynamo-helpers'

/**
 * The site as an installed app (src/app/manifest.ts, public/sw.js) and its
 * push notifications. Delivery itself goes through Google's, Apple's or
 * Mozilla's push service, which a test cannot reach; these specs cover what
 * the server stores and what the browser asks, with the browser's push
 * service faked where needed (fakePush).
 */

// The service worker and the notification question are what this spec is
// about; the config keeps both out of every other one.
test.use({ serviceWorkers: 'allow', storageState: { cookies: [], origins: [] } })

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

/** A subscription as a browser hands it over, at Google's push service. */
function fakeSubscription(tag: string) {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${tag}-${unique()}`,
    expirationTime: null,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  }
}

/**
 * Stands in for the browser's permission question and push service, across
 * page loads: «Allow» is answered at once, and `subscribe` returns `sub`.
 */
async function fakePush(page: Page, sub: ReturnType<typeof fakeSubscription>) {
  await page.addInitScript((sub) => {
    const read = (key: string) => localStorage.getItem(key)
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => read('fake.permission') ?? 'default' })
    Notification.requestPermission = async () => {
      localStorage.setItem('fake.permission', 'granted')
      localStorage.setItem('fake.asked', String(Number(read('fake.asked') ?? 0) + 1))
      return 'granted'
    }
    const current = (): PushSubscription | null => {
      const key = read('fake.subscriptionKey')
      if (!key) return null
      const applicationServerKey = new Uint8Array(JSON.parse(key)).buffer
      return {
        endpoint: sub.endpoint,
        expirationTime: null,
        options: { applicationServerKey, userVisibleOnly: true },
        toJSON: () => sub,
        unsubscribe: async () => { localStorage.removeItem('fake.subscriptionKey'); return true },
        getKey: () => null,
      } as unknown as PushSubscription
    }
    PushManager.prototype.getSubscription = async () => current()
    PushManager.prototype.subscribe = async (options?: PushSubscriptionOptionsInit) => {
      const key = options?.applicationServerKey as Uint8Array
      localStorage.setItem('fake.subscriptionKey', JSON.stringify(Array.from(new Uint8Array(key))))
      return current()!
    }
  }, sub)
}

test.describe('Installable app', () => {
  test('The manifest, its icons, the service worker and the offline page are served', async ({ page, request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest).toMatchObject({ name: 'NextService', display: 'standalone', start_url: '/app/open/', scope: '/', lang: 'el' })
    const icons = manifest.icons as { src: string; sizes: string; purpose: string }[]
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual([
      '192x192 any', '192x192 maskable', '512x512 any', '512x512 maskable',
    ])
    for (const src of [...icons.map((i) => i.src), '/icons/apple-touch-icon.png', '/icons/badge-96.png']) {
      const icon = await request.get(src)
      expect(icon.status(), src).toBe(200)
      expect(icon.headers()['content-type'], src).toBe('image/png')
    }

    const sw = await request.get('/sw.js')
    expect(sw.status()).toBe(200)
    expect(sw.headers()['content-type']).toContain('javascript')
    const offline = await request.get('/offline.html')
    expect(offline.status()).toBe(200)
    expect(await offline.text()).toContain('Δεν υπάρχει σύνδεση')

    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fbf9f8')
  })

  test('The app opens on the account of whoever is signed in', async ({ request, playwright }) => {
    const opens = async (headers: Record<string, string> = {}) => {
      const res = await request.get('/app/open/', { headers, maxRedirects: 0 })
      expect(res.status()).toBe(307)
      return new URL(res.headers().location, 'http://localhost:3000').pathname
    }
    const guest = await newGuest(playwright)
    const anonymous = await guest.get('/app/open/', { maxRedirects: 0 })
    expect(new URL(anonymous.headers().location, 'http://localhost:3000').pathname).toBe('/')
    await guest.dispose()

    const client = await newClient(request, 'pwa-open')
    const garage = await newGarage(request, { prefix: 'pwa-open' })
    expect(await opens(cookie(client.token))).toBe(`/requests/${client.clientId}/`)
    expect(await opens(cookie(garage.token))).toBe(`/garage-dashboard/${garage.id}/`)
  })

  test('The installed app keeps its session for 3 days; a browser tab keeps the short one', async ({ request, playwright }) => {
    const client = await newClient(request, 'pwa-session')
    const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(claims(client.token).app).toBeUndefined()

    const res = await request.post('/api/auth/app-session/', { headers: cookie(client.token) })
    expect(await res.json()).toEqual({ app: true })
    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(setCookie).toContain('Max-Age=259200')
    const appToken = setCookie.match(/auth-token=([^;]+)/)![1]
    expect(claims(appToken)).toMatchObject({ userId: client.clientId, userType: 'client', app: true })
    expect(claims(appToken).exp - claims(appToken).iat).toBe(3 * 24 * 60 * 60)

    // Already the app's: nothing to re-issue.
    const again = await request.post('/api/auth/app-session/', { headers: cookie(appToken) })
    expect(await again.json()).toEqual({ app: true })
    expect(again.headers()['set-cookie']).toBeUndefined()

    // The longer session still works everywhere the short one does.
    expect((await request.get('/api/auth/me/', { headers: cookie(appToken) })).status()).toBe(200)

    const guest = await newGuest(playwright)
    expect(await (await guest.post('/api/auth/app-session/')).json()).toEqual({ app: false })
    await guest.dispose()
  })

  test('Offline, a page is answered with the offline screen, which returns by itself', async ({ page, context }) => {
    await page.goto('/app/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    // The worker claims the page once active; from then on it answers navigations.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    await context.setOffline(true)
    await page.goto('/about/').catch(() => {})
    await expect(page.getByRole('heading', { name: 'Δεν υπάρχει σύνδεση' })).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByRole('heading', { name: 'Δεν υπάρχει σύνδεση' })).toBeHidden({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/about\/$/)
  })
})

test.describe('The /app/ page', () => {
  test('Installs with one tap where the browser offers it', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
        offer.prompt = async () => { (window as unknown as { prompted: boolean }).prompted = true }
        offer.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(offer)
      })
    })
    await page.goto('/app/')
    await page.getByRole('button', { name: 'Εγκατάσταση' }).click()
    await expect(page.getByText('Έτοιμο, το NextService είναι στην οθόνη σου')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true)
  })

  test("The client's requests install it with one tap too", async ({ page, request }) => {
    const client = await newClient(request, 'pwa-nudge-tap')
    await page.addInitScript(() => {
      window.addEventListener('load', () => {
        const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
        offer.prompt = async () => { (window as unknown as { prompted: boolean }).prompted = true }
        offer.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(offer)
      })
    })
    await page.context().addCookies([{ name: 'auth-token', value: client.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
    await page.goto(`/requests/${client.clientId}/`)
    const card = page.getByRole('region', { name: 'Η εφαρμογή NextService' })
    await card.getByRole('button', { name: 'Εγκατάσταση' }).click()
    await expect(card).toBeHidden()
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true)
  })

  test("Without the offer, it gives the browser's own steps, and sends a visitor to sign in for notifications", async ({ page }) => {
    await page.goto('/app/')
    await expect(page.getByRole('heading', { name: 'Στον υπολογιστή σου' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Συνδέσου' })).toHaveAttribute('href', '/login/?next=/app/')
  })
})

test.describe('Push subscriptions', () => {
  test('A device belongs to the signed-in account, moves with the next sign-in, and leaves on sign-out', async ({ request, playwright }) => {
    const client = await newClient(request, 'push')
    const garage = await newGarage(request, { prefix: 'push' })
    const sub = fakeSubscription('device')
    const save = (token: string, subscription: unknown) =>
      request.post('/api/push/subscriptions/', { headers: cookie(token), data: { subscription } })

    // Whose device it is comes from the session alone.
    const guest = await newGuest(playwright)
    expect((await guest.get('/api/push/subscriptions/')).status()).toBe(401)
    expect((await guest.post('/api/push/subscriptions/', { data: { subscription: sub } })).status()).toBe(401)
    await guest.dispose()

    const key = (await (await request.get('/api/push/subscriptions/', { headers: cookie(client.token) })).json()).publicKey
    const keyBytes = Buffer.from(key, 'base64url')
    expect(keyBytes.length).toBe(65)
    expect(keyBytes[0]).toBe(4)

    // Only a real push service: the server posts to whatever is stored.
    expect((await save(client.token, { ...sub, endpoint: 'https://example.com/push/1' })).status()).toBe(400)
    expect((await save(client.token, { ...sub, endpoint: sub.endpoint.replace('https:', 'http:') })).status()).toBe(400)
    expect((await save(client.token, { ...sub, endpoint: 'https://fcm.googleapis.com.example.com/x' })).status()).toBe(400)
    expect((await save(client.token, { ...sub, keys: { ...sub.keys, auth: 'short' } })).status()).toBe(400)

    expect((await save(client.token, sub)).status()).toBe(200)
    expect((await save(client.token, sub)).status()).toBe(200)
    expect(await pushSubscriptionsOf('client', client.clientId)).toEqual([sub.endpoint])

    // Someone else signs in on the same device: the client's notifications stop going there.
    expect((await save(garage.token, sub)).status()).toBe(200)
    expect(await pushSubscriptionsOf('client', client.clientId)).toEqual([])
    expect(await pushSubscriptionsOf('garage', garage.id)).toEqual([sub.endpoint])

    // The client signing out late cannot take it from the garage.
    const remove = (token: string) =>
      request.delete('/api/push/subscriptions/', { headers: cookie(token), data: { endpoint: sub.endpoint } })
    expect((await remove(client.token)).status()).toBe(200)
    expect(await pushSubscriptionsOf('garage', garage.id)).toEqual([sub.endpoint])
    expect((await remove(garage.token)).status()).toBe(200)
    expect(await pushSubscriptionsOf('garage', garage.id)).toEqual([])
  })

  test('A garage is asked once signed in, can turn them off and on in its settings, and signing out releases the device', async ({ page, request }) => {
    const garage = await newGarage(request, { prefix: 'push-ui' })
    const sub = fakeSubscription('garage-ui')
    await fakePush(page, sub)
    await signInGarage(page, garage)

    await page.goto(`/garage-dashboard/${garage.id}/?tab=requests`)
    const prompt = page.getByRole('dialog', { name: 'Ειδοποιήσεις' })
    await prompt.getByRole('button', { name: 'Ενεργοποίηση' }).click()
    // The first subscription waits for the service worker to install.
    await expect(prompt).toBeHidden({ timeout: 30_000 })
    await expect.poll(() => pushSubscriptionsOf('garage', garage.id)).toEqual([sub.endpoint])

    await page.goto(`/garage-dashboard/${garage.id}/?tab=settings`)
    const toggle = page.getByRole('switch', { name: 'Ειδοποιήσεις σε αυτή τη συσκευή' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => pushSubscriptionsOf('garage', garage.id)).toEqual([])

    // Turned off stays off: the next visit does not quietly subscribe again, nor ask.
    await page.reload()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(await pushSubscriptionsOf('garage', garage.id)).toEqual([])
    await expect(prompt).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => pushSubscriptionsOf('garage', garage.id)).toEqual([sub.endpoint])

    await page.getByRole('button', { name: 'Αποσύνδεση' }).first().click()
    await page.waitForURL('http://localhost:3000/')
    await expect.poll(() => pushSubscriptionsOf('garage', garage.id)).toEqual([])
  })

  test('A client in a browser tab is not asked; the profile has the switch', async ({ page, request }) => {
    const client = await newClient(request, 'push-tab')
    const sub = fakeSubscription('client-tab')
    await fakePush(page, sub)
    await page.context().addCookies([{ name: 'auth-token', value: client.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])

    await page.goto(`/profile/${client.clientId}/`)
    const toggle = page.getByRole('switch', { name: 'Ειδοποιήσεις σε αυτή τη συσκευή' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('dialog', { name: 'Ειδοποιήσεις' })).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => pushSubscriptionsOf('client', client.clientId)).toEqual([sub.endpoint])
  })
})
