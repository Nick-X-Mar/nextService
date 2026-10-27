import WebSocket from 'ws'
import type { Page } from '@playwright/test'
import { TEST_GARAGE } from './helpers'

// Local AppSync mock endpoint, also used by the app in development.
// APPSYNC_MOCK_PORT points the suite at a second instance — the way to try
// edits to local-appsync-server.js before the shared one on :3002 is
// restarted. The app itself always publishes to :3002, so only the specs that
// talk to the mock directly are meaningful against another port.
const MOCK_PORT = Number(process.env.APPSYNC_MOCK_PORT || 3002)
const APPSYNC_WS_URL = `ws://localhost:${MOCK_PORT}/graphql`
const APPSYNC_HEALTH_URL = `http://localhost:${MOCK_PORT}/health`
const APPSYNC_PUBLISH_URL = `http://localhost:${MOCK_PORT}/publish`
const APP_URL = 'http://localhost:3000'

/**
 * A realtime token for TEST_GARAGE, minted by the app exactly as a browser
 * gets one. The mock enforces the production authorizer's rules, so a
 * tokenless subscriber is refused — and TEST_GARAGE (active) may join the
 * broadcast channels and its own `request-*-garage-<id>` threads, which is
 * every channel these suites listen on.
 */
let garageToken: { value: string; expiresAt: number } | null = null

export async function realtimeTokenFor(sessionCookie: string): Promise<string> {
  const res = await requestRealtimeToken(sessionCookie)
  if (res.status !== 200 || !res.data.token) throw new Error(`realtime token failed: ${res.status}`)
  return res.data.token as string
}

/** The raw answer of /api/realtime/token, for asserting a refusal. */
export async function requestRealtimeToken(
  sessionCookie: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${APP_URL}/api/realtime/token/`, {
    headers: { Cookie: `auth-token=${sessionCookie}` },
  })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

async function defaultToken(): Promise<string> {
  if (garageToken && garageToken.expiresAt > Date.now() + 60_000) return garageToken.value
  const login = await fetch(`${APP_URL}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_GARAGE.email, password: TEST_GARAGE.password, userType: 'garage' }),
  })
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith('auth-token='))
  if (!login.ok || !cookie) throw new Error(`TEST_GARAGE login failed: ${login.status}`)
  const value = await realtimeTokenFor(cookie.slice('auth-token='.length).split(';')[0])
  garageToken = { value, expiresAt: Date.now() + 10 * 60_000 }
  return value
}

/** Same credential encoding the app's socket uses (`header-<base64url JSON>`). */
function authProtocol(token: string): string {
  const json = JSON.stringify({ Authorization: `Bearer ${token}`, host: 'localhost' })
  return `header-${Buffer.from(json).toString('base64url')}`
}

// Standalone helpers for talking to the AppSync mock from inside Playwright
// tests. We don't reuse src/lib/appsync-service because that singleton is
// designed for browser/Node app usage and would carry its own connection
// state across tests.

export interface AppSyncEvent {
  __type?: string
  request?: { id?: string; [k: string]: unknown }
  requestId?: string
  status?: string
  reason?: string
  [k: string]: unknown
}

interface CollectedEvent {
  channel: string | undefined
  data: AppSyncEvent
}

export interface Subscription {
  socket: WebSocket
  events: CollectedEvent[]
  // Resolves with the matching event once one arrives, or rejects after timeout.
  waitFor: (predicate: (e: CollectedEvent) => boolean, timeoutMs?: number) => Promise<CollectedEvent>
  close: () => void
}

export async function isAppSyncMockReachable(): Promise<boolean> {
  try {
    const res = await fetch(APPSYNC_HEALTH_URL)
    return res.ok
  } catch {
    return false
  }
}

// Subscribes to one or more channels and collects every incoming event into
// memory. Tests can then assert on `events` directly or await `waitFor`.
// Without `token` it subscribes as TEST_GARAGE.
export async function subscribeToChannels(
  channels: string[],
  { token }: { token?: string } = {}
): Promise<Subscription> {
  const credential = token ?? (await defaultToken())
  const ws = new WebSocket(APPSYNC_WS_URL, ['aws-appsync-event-ws', authProtocol(credential)])
  const events: CollectedEvent[] = []
  const waiters: Array<{
    predicate: (e: CollectedEvent) => boolean
    resolve: (e: CollectedEvent) => void
  }> = []

  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => reject(err)
    ws.once('open', () => resolve())
    ws.once('error', fail)
    setTimeout(() => fail(new Error('Timed out connecting to AppSync mock')), 5000)
  })

  // Data frames are addressed like AWS addresses them: by the subscribe frame's id.
  const channelBySubId = new Map<string, string>()

  ws.on('message', (raw) => {
    let parsed: {
      type?: string
      id?: string
      event?: string
      payload?: { channelName?: string; data?: { subscribe?: AppSyncEvent } }
    }
    try {
      parsed = JSON.parse(String(raw))
    } catch {
      return
    }
    if (parsed.type !== 'data') return
    let event: CollectedEvent
    if (typeof parsed.event === 'string') {
      try {
        event = { channel: parsed.id ? channelBySubId.get(parsed.id) : undefined, data: JSON.parse(parsed.event) as AppSyncEvent }
      } catch {
        return
      }
    } else if (parsed.payload) {
      // The mock's subscribe confirmation.
      event = { channel: parsed.payload.channelName, data: (parsed.payload.data?.subscribe ?? {}) as AppSyncEvent }
    } else {
      return
    }
    events.push(event)
    // Drain any matching waiters.
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(event)) {
        waiters[i].resolve(event)
        waiters.splice(i, 1)
      }
    }
  })

  // Wait for connection_ack, then subscribe to each requested channel.
  await new Promise<void>(resolve => setTimeout(resolve, 100))
  for (const channel of channels) {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    channelBySubId.set(id, channel)
    ws.send(JSON.stringify({
      id,
      type: 'start',
      payload: { data: channel },
      authorization: { Authorization: `Bearer ${credential}`, host: 'localhost' },
    }))
  }
  // Tiny delay so the server registers the subscription before the test
  // proceeds to publish.
  await new Promise<void>(resolve => setTimeout(resolve, 100))

  return {
    socket: ws,
    events,
    waitFor(predicate, timeoutMs = 5000) {
      // Check existing events first.
      const existing = events.find(predicate)
      if (existing) return Promise.resolve(existing)
      return new Promise<CollectedEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex(w => w.predicate === predicate)
          if (idx !== -1) waiters.splice(idx, 1)
          reject(new Error(
            `Timeout waiting for AppSync event after ${timeoutMs}ms. ` +
            `Got ${events.length} events: ${JSON.stringify(events).slice(0, 500)}`
          ))
        }, timeoutMs)
        waiters.push({
          predicate,
          resolve: (e) => { clearTimeout(timer); resolve(e) },
        })
      })
    },
    close() {
      try { ws.close() } catch { /* ignore */ }
    },
  }
}

/** Opens an authenticated socket, or rejects when the mock refuses the connection. */
async function openSocket(token: string): Promise<WebSocket> {
  const ws = new WebSocket(APPSYNC_WS_URL, ['aws-appsync-event-ws', authProtocol(token)])
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('unexpected-response', (_req, res) => reject(new Error(`connection refused: ${res.statusCode}`)))
    ws.once('error', reject)
    setTimeout(() => reject(new Error('Timed out connecting to AppSync mock')), 5000)
  })
  return ws
}

/**
 * Sends one frame and reports the mock's reply to it by type — `data` for a
 * subscribe that registered, `subscribe_error` / `publish_error` for a refusal,
 * or `none` when nothing came back (which is how an accepted publish looks).
 */
async function sendFrame(token: string, frame: Record<string, unknown>, waitMs = 1500): Promise<string> {
  const ws = await openSocket(token)
  const id = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    return await new Promise<string>((resolve) => {
      ws.on('message', (raw) => {
        try {
          const reply = JSON.parse(String(raw))
          if (reply.id === id) resolve(String(reply.type))
        } catch {
          // not ours
        }
      })
      ws.send(JSON.stringify({ ...frame, id, authorization: { Authorization: `Bearer ${token}`, host: 'localhost' } }))
      setTimeout(() => resolve('none'), waitMs)
    })
  } finally {
    ws.close()
  }
}

/** Whether `token` may subscribe to `channel` (null = a frame that names none). */
export async function trySubscribe(channel: string | null, token: string): Promise<'subscribed' | 'denied'> {
  const reply = await sendFrame(token, { type: 'start', payload: channel === null ? {} : { data: channel } })
  return reply === 'data' ? 'subscribed' : 'denied'
}

/** Publishes over the socket, as a browser would. Resolves `refused` when the mock says so. */
export async function tryPublish(
  channel: string | null,
  message: Record<string, unknown>,
  token: string
): Promise<'refused' | 'not refused'> {
  const reply = await sendFrame(token, { type: 'publish', ...(channel === null ? {} : { roomId: channel }), message })
  return reply === 'publish_error' ? 'refused' : 'not refused'
}

/** Publishes over HTTP, the way the app server does, with whatever token is given. */
export async function publishOverHttpAs(
  token: string,
  channel: string,
  message: Record<string, unknown>
): Promise<number> {
  const res = await fetch(APPSYNC_PUBLISH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ roomId: channel, message }),
  })
  return res.status
}

/**
 * Resolves once the page's AppSync socket has been told it is subscribed to
 * `room` (the mock's `subscribe_success`-style reply names the room).
 *
 * Call it BEFORE the navigation that opens the socket. A test that fires an
 * event as soon as the page looks ready races the token fetch, the handshake
 * and the subscribe — on a cold dev server the event lands first and is gone,
 * because real-time is push-only and the next summary poll is 30s away.
 *
 * The generous default is for the dev server: the pages subscribe once their
 * first data load returns, and a route the dev server has evicted recompiles
 * on that load (10–20s for the garage feed), which production never does.
 */
export function waitForRoomSubscription(page: Page, room: string, timeoutMs = 60_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The page never subscribed to "${room}" within ${timeoutMs}ms`)),
      timeoutMs
    )
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"subscribed"') && text.includes(`"${room}"`)) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  })
}
