import WebSocket from 'ws'

// Local AppSync mock endpoint, also used by the app in development.
const APPSYNC_WS_URL = 'ws://localhost:3002/graphql'
const APPSYNC_HEALTH_URL = 'http://localhost:3002/health'

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
export async function subscribeToChannels(channels: string[]): Promise<Subscription> {
  const ws = new WebSocket(APPSYNC_WS_URL)
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

  ws.on('message', (raw) => {
    let parsed: { type?: string; payload?: { channelName?: string; data?: { subscribe?: AppSyncEvent } } }
    try {
      parsed = JSON.parse(String(raw))
    } catch {
      return
    }
    if (parsed.type !== 'data' || !parsed.payload) return
    const event: CollectedEvent = {
      channel: parsed.payload.channelName,
      data: (parsed.payload.data?.subscribe ?? {}) as AppSyncEvent,
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
    ws.send(JSON.stringify({
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'start',
      payload: { data: channel },
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
