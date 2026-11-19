/*
 * The service worker of the site and of the installed app (the PWA), for two
 * things only:
 *
 * - Push notifications (src/utils/pushService.ts sends them): shown here,
 *   and a tap opens their page, in the window already open when there is one.
 * - An offline page: a page that cannot be reached is answered with
 *   /offline.html, cached at install. Nothing else is cached, so the site
 *   is never served stale; every other request goes to the network as if
 *   this file did not exist.
 *
 * Registered by src/lib/web-push-client.ts. Served by Amplify from public/
 * with a 5-second cache, and browsers check it for changes on every
 * navigation, so a change here reaches everyone on their next visit. Bump
 * OFFLINE_CACHE when offline.html changes.
 */

const OFFLINE_CACHE = 'nextservice-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)))
    // The page's request starts while this worker starts up, instead of after.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse
      if (preloaded) return preloaded
      return await fetch(event.request)
    } catch {
      return (await caches.match(OFFLINE_URL)) || Response.error()
    }
  })())
})

// ── Push ────────────────────────────────────────────────────────────────

/** The window showing this exact page, focused: its user is looking at it. */
async function focusedOn(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.some((client) => {
    const at = new URL(client.url)
    return client.focused && at.pathname === url.pathname && at.search === url.search
  })
}

// Safari takes notifications away from a site that receives a push and shows
// nothing, so on Apple's push service (every browser on an iPhone or iPad,
// Safari on a Mac) every push is shown.
const UA = self.navigator.userAgent
const IS_APPLE = /iPhone|iPad|iPod/.test(UA)
  || (/Macintosh/.test(UA) && /Safari/.test(UA) && !/Chrome|Chromium|Edg|Firefox/.test(UA))

self.addEventListener('push', (event) => {
  let message = {}
  try { message = event.data ? event.data.json() : {} } catch { /* not ours */ }
  const url = new URL(message.url || '/', self.location.origin)

  event.waitUntil((async () => {
    // The conversation is open in front of them: the message is already on screen.
    if (!IS_APPLE && message.tag && (await focusedOn(url))) return
    await self.registration.showNotification(message.title || 'NextService', {
      body: message.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'el',
      tag: message.tag,
      renotify: !!message.tag,
      data: { url: url.href },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  if (url.origin !== self.location.origin) return

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      if ('navigate' in open) {
        try { await open.navigate(url.href); return } catch { /* not ours to steer: open a new one */ }
      } else {
        return
      }
    }
    await self.clients.openWindow(url.href)
  })())
})

// The browser replaced the subscription (Firefox does when it rotates keys):
// hand the new one to the server under the same session.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const options = event.oldSubscription && event.oldSubscription.options
    const subscription = event.newSubscription
      || (options && await self.registration.pushManager.subscribe(options))
    if (!subscription) return
    await fetch('/api/push/subscriptions/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
  })())
})
