/**
 * Push notifications, browser side: asking, subscribing, and handing the
 * subscription to the server (`/api/push/subscriptions`, which sends through
 * src/utils/pushService.ts; public/sw.js shows them).
 *
 * A subscription belongs to whoever is signed in: it is sent again on every
 * verified sign-in (PwaManager), which also re-owns a device someone else
 * used before, and released before signing out (AuthContext). Turning them
 * off is remembered for this browser, so a later sign-in does not quietly
 * turn them back on.
 */
import { isIOS, isStandalone, registerServiceWorker } from '@/lib/pwa'

/**
 * - `unsupported`: this browser has no push (in-app browsers such as
 *   Instagram's, older browsers)
 * - `needs-install`: an iPhone or iPad, where only the installed app gets them
 * - `denied`: the person blocked them; only the browser's settings undo that
 * - `off` / `on`: for this browser, with the account signed in
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const OFF_KEY = 'pushNotifications.off'

function turnedOff(): boolean {
  try { return localStorage.getItem(OFF_KEY) === '1' } catch { return false }
}

function setTurnedOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1')
    else localStorage.removeItem(OFF_KEY)
  } catch { /* private mode: it simply is not remembered */ }
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted' || turnedOff()) return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

/**
 * Whether this browser gets the push notifications already, so the garage
 * dashboard's own "new request" notification (useNewRequestNotifier) would
 * be a second one of the same.
 */
export function pushActiveHere(): boolean {
  return pushSupported() && Notification.permission === 'granted' && !turnedOff()
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const bytes = new Uint8Array(a)
  return bytes.every((byte, i) => byte === b[i])
}

/** How long a new service worker gets to activate before subscribing gives up. */
const READY_TIMEOUT_MS = 20_000

/** What this tab last handed the server, `<account>|<endpoint>`: once is enough per session. */
const SYNCED_KEY = 'pushNotifications.synced'

function markSynced(value: string | null) {
  try {
    if (value) sessionStorage.setItem(SYNCED_KEY, value)
    else sessionStorage.removeItem(SYNCED_KEY)
  } catch { /* it is simply sent again */ }
}

function syncedAlready(value: string): boolean {
  try { return sessionStorage.getItem(SYNCED_KEY) === value } catch { return false }
}

/**
 * Subscribes (or keeps the subscription) and gives it to the signed-in
 * account; `account`, when known, skips the request if this tab already did.
 */
async function subscribeAndSave(account?: string): Promise<boolean> {
  const reg = await registerServiceWorker()
  if (!reg) return false
  // A worker that never activates (its install failed) must not leave a
  // button spinning: give up, and the next sign-in tries again.
  const ready = await Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), READY_TIMEOUT_MS)),
  ])
  if (!ready) return false

  const keyRes = await fetch('/api/push/subscriptions/', { cache: 'no-store' })
  if (!keyRes.ok) return false
  const key = base64urlToBytes((await keyRes.json()).publicKey)

  let subscription = await reg.pushManager.getSubscription()
  // Made with another server key (JWT_SECRET was rotated): no longer deliverable.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })

  const synced = account ? `${account}|${subscription.endpoint}` : null
  if (synced && syncedAlready(synced)) return true
  const res = await fetch('/api/push/subscriptions/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  if (res.ok) markSynced(synced)
  return res.ok
}

/**
 * Asks for notifications and turns them on. Call it straight from a tap:
 * Safari asks only in answer to one, and the permission question has to be
 * the first thing awaited.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState()
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'
  setTurnedOff(false)
  try {
    return (await subscribeAndSave()) ? 'on' : 'off'
  } catch (error) {
    console.warn('[push] Could not subscribe:', error)
    return 'off'
  }
}

/** Turns them off for this browser, here and on the server. */
export async function disablePush(): Promise<PushState> {
  setTurnedOff(true)
  markSynced(null)
  const subscription = pushSupported() ? await currentSubscription() : null
  if (subscription) {
    await fetch('/api/push/subscriptions/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {})
    await subscription.unsubscribe().catch(() => false)
  }
  return pushState()
}

/**
 * On every verified sign-in: where notifications are allowed and not turned
 * off, the account gets this browser's subscription. No question is asked.
 */
export async function syncPush(account: string): Promise<void> {
  if (!pushActiveHere()) return
  try {
    await subscribeAndSave(account)
  } catch (error) {
    console.warn('[push] Could not renew the subscription:', error)
  }
}

/**
 * Before signing out, while the cookie still says whose browser this is: it
 * stops getting that account's notifications. The subscription itself stays,
 * for whoever signs in next to take over without being asked again.
 */
export async function releasePush(): Promise<void> {
  if (!pushSupported()) return
  markSynced(null)
  try {
    const subscription = await currentSubscription()
    if (!subscription) return
    await fetch('/api/push/subscriptions/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } catch { /* signing out anyway */ }
}
