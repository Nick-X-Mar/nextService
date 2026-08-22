// AWS AppSync service for real-time pub/sub. Originally chat-only; now also
// used to broadcast new service requests and request status updates to
// subscribed garage dashboards.
type AppSyncEvent = Record<string, unknown>
// Subscribers may know more about the payload shape than AppSyncService does
// (e.g. ChatMessage). Storing callbacks as `any` keeps strict mode happy at
// the call sites without forcing every subscriber to widen its type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppSyncCallback = (message: any) => void
type ReconnectListener = () => void

/**
 * Fetches a short-lived realtime token from our own API.
 *
 * The AppSync Events API is authorized by a Lambda that validates this token
 * and checks the caller against the channel they ask for. The API key is no
 * longer an access control — it is public in this bundle, so anyone holding it
 * could previously read or forge any conversation.
 *
 * Cached until shortly before expiry so reconnects don't hit the API each time.
 */
let realtimeToken: { value: string; expiresAt: number } | null = null

async function getRealtimeToken(): Promise<string | null> {
  if (realtimeToken && realtimeToken.expiresAt > Date.now() + 30_000) {
    return realtimeToken.value
  }
  // On the server there is no /api to call and no cookie to present — mint a
  // system token directly. API routes publishing chat messages and request
  // broadcasts take this path.
  if (typeof window === 'undefined') {
    return mintSystemToken()
  }
  try {
    // Bounded on purpose. This runs before the socket exists, so it is not
    // covered by CONNECT_TIMEOUT_MS; a fetch that never settles used to leave
    // `connectPromise` pending forever, and every later connect() joined that
    // same dead promise for the life of the page.
    const res = await fetch('/api/realtime/token/', {
      credentials: 'include',
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.token) return null
    realtimeToken = {
      value: data.token,
      expiresAt: Date.now() + (Number(data.expiresIn) || 900) * 1000,
    }
    return realtimeToken.value
  } catch {
    return null
  }
}

/**
 * The credential attached to every subscribe/publish frame.
 *
 * Browser: the realtime token fetched above. Server (API routes publishing
 * chat and request broadcasts): a token minted locally with the same secret and
 * `userType: 'system'`, which the authorizer accepts for publishing to any
 * channel. Falling back to the API key keeps the local mock server working,
 * since it has no authorizer in front of it.
 */
/**
 * Signs a short-lived `system` token for server-side publishing.
 *
 * Server code is already trusted — it is the thing that decided the message is
 * legitimate — but the authorizer now requires a token on every publish, so it
 * needs one of its own. Never reachable from the browser: `jose` is imported
 * lazily inside the server-only branch so it stays out of the client bundle.
 */
async function mintSystemToken(): Promise<string | null> {
  const secret = process.env.REALTIME_JWT_SECRET
  if (!secret) {
    console.error('[appsync] REALTIME_JWT_SECRET not set — cannot publish')
    return null
  }
  try {
    const { SignJWT } = await import('jose')
    const ttl = 300
    const token = await new SignJWT({ userId: 'system', userType: 'system' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('appsync-events')
      .setExpirationTime(`${ttl}s`)
      .sign(new TextEncoder().encode(secret))
    realtimeToken = { value: token, expiresAt: Date.now() + ttl * 1000 }
    return token
  } catch (err) {
    console.error('[appsync] failed to mint system token', err)
    return null
  }
}

function buildAuthorization(): Record<string, string | undefined> {
  const host = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
  if (realtimeToken && realtimeToken.expiresAt > Date.now()) {
    return { Authorization: `Bearer ${realtimeToken.value}`, host }
  }
  return { 'x-api-key': process.env.NEXT_PUBLIC_APPSYNC_API_KEY, host }
}

// Safari never gives up on a stalled WebSocket handshake by itself — the socket
// just sits in CONNECTING and no event ever fires. Anything awaiting connect()
// hangs with it, which is how the chat page ended up stuck on its spinner.
const CONNECT_TIMEOUT_MS = 8000
const TOKEN_TIMEOUT_MS = 5000
const MAX_RECONNECT_DELAY_MS = 30000

/**
 * Whether we are talking to the local mock (`local-appsync-server.js`) rather
 * than real AppSync. The two speak different frame formats.
 *
 * This used to be decided two incompatible ways: the wire protocol keyed off
 * the endpoint, while the frame format keyed off `NODE_ENV === 'development'`.
 * Running `next dev` against real AppSync therefore opened the socket with the
 * AWS subprotocol and then sent mock-shaped frames — AppSync never registered
 * the subscription and only logged `subscribe_error`.
 */
function isMockEndpoint(): boolean {
  return (process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT || '').includes('localhost:3002')
}

/**
 * Frame-level logging is deafening on a busy chat page and costs real time in
 * the browsers that are slowest here. Opt in with
 * NEXT_PUBLIC_APPSYNC_DEBUG=true; warnings and errors always print.
 */
const DEBUG = process.env.NEXT_PUBLIC_APPSYNC_DEBUG === 'true'
const debug = (...args: unknown[]) => { if (DEBUG) debug(...args) }

class AppSyncService {
  private ws: WebSocket | null = null
  // Multiple components can listen on the same channel (e.g. the dashboard
  // page tracks the badge while the AvailableRequests tab tracks the list).
  // A Set per channel lets each subscriber be removed independently.
  private subscriptions: Map<string, Set<AppSyncCallback>> = new Map()
  // AppSync's unsubscribe frame references the id of the subscribe frame that
  // opened it, so that id has to survive. Without it `unsubscribe()` sent
  // nothing at all outside local dev, and every chat thread a user opened left
  // another live server-side subscription on the shared socket until it hit
  // AppSync's per-connection cap and started refusing new ones.
  private subscriptionIds: Map<string, string> = new Map()
  private reconnectListeners: Set<ReconnectListener> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private isConnected = false
  private hasEverConnected = false
  // Concurrent callers (a chat page and the dashboard hook mounting together)
  // must share one socket. Without this each opened its own, the later
  // assignment orphaned the earlier one, and the orphan's close handler then
  // fought the live socket over reconnects.
  private connectPromise: Promise<void> | null = null
  // Set by disconnect() so a deliberate teardown isn't mistaken for an outage.
  private intentionalClose = false
  private wakeListenersBound = false

  constructor() {
    this.bindWakeListeners()
  }

  /**
   * Reopens the socket when the browser comes back to life.
   *
   * iOS Safari suspends WebSockets whenever the tab is backgrounded or the
   * screen locks, and it does not tell the page: the socket is simply dead on
   * return. Without these handlers the only way back was a manual refresh,
   * which is exactly what users were having to do.
   */
  private bindWakeListeners() {
    if (typeof window === 'undefined' || this.wakeListenersBound) return
    this.wakeListenersBound = true

    const wake = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      // Nothing is listening — opening a socket now would just be a leak.
      if (this.subscriptions.size === 0) return
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) return
      // A live user gesture is better evidence than the backoff counter.
      this.reconnectAttempts = 0
      this.connect().catch(() => { /* handleReconnect keeps trying */ })
    }

    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('pageshow', wake)
    window.addEventListener('focus', wake)
  }

  /**
   * Opens the socket, or joins the existing / in-flight connection.
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) return
    if (this.connectPromise) return this.connectPromise

    this.intentionalClose = false
    this.connectPromise = this.openSocket().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async openSocket(): Promise<void> {
    // Obtained before opening the socket: the authorizer rejects the
    // connection without it.
    const realtimeAuth = await getRealtimeToken()
    return new Promise((resolve, reject) => {
      // The handshake can end in onopen, onerror, onclose or the timeout below,
      // and on Safari more than one of those fires. Settle exactly once.
      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const succeed = () => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        resolve()
      }
      const fail = (err: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        reject(err)
      }
      try {
        const endpoint = process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT
        const apiKey = process.env.NEXT_PUBLIC_APPSYNC_API_KEY
        const graphqlEndpoint = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
        
        debug('🔌 AppSync Environment Variables:')
        debug('  WEBSOCKET_ENDPOINT:', endpoint)
        debug('  API_KEY:', apiKey ? 'SET' : 'NOT SET')
        debug('  GRAPHQL_ENDPOINT:', graphqlEndpoint)
        
        if (!endpoint || !apiKey || !graphqlEndpoint) {
          throw new Error('AppSync configuration missing')
        }

        debug('🔌 Connecting to AppSync Events WebSocket:', endpoint)
        
        // Authorization for AppSync Events. The Lambda authorizer reads the
        // bearer token; `x-api-key` is kept for the local mock server only,
        // which has no authorizer.
        const authorization: Record<string, string> = realtimeAuth
          ? { Authorization: `Bearer ${realtimeAuth}`, host: graphqlEndpoint }
          : { 'x-api-key': apiKey, host: graphqlEndpoint }
        
        // Construct the protocol header for the connection (AWS AppSync Events format)
        const getAuthProtocol = () => {
          const header = btoa(JSON.stringify(authorization))
            .replace(/\+/g, '-') // Convert '+' to '-'
            .replace(/\//g, '_') // Convert '/' to '_'
            .replace(/=+$/, '') // Remove padding '='
          return `header-${header}`
        }
        
        // Use AppSync Events WebSocket endpoint with proper protocol
        const isLocal = isMockEndpoint()
        const wsUrl = isLocal ? endpoint : `${endpoint}/event/realtime`
        debug('🔌 AppSync Events WebSocket URL:', wsUrl)
        
        // Use the correct WebSocket protocol based on server type
        if (isLocal) {
          // Local server - simple WebSocket connection
          this.ws = new WebSocket(wsUrl)
        } else {
          // AWS AppSync - use proper protocol
          this.ws = new WebSocket(wsUrl, [
            'aws-appsync-event-ws',
            getAuthProtocol(),
          ])
        }
        
        // Every handler below belongs to *this* socket. A replaced socket can
        // still emit close/error afterwards, and without this guard that stale
        // event would mark the live connection as down.
        const socket = this.ws
        const isCurrent = () => this.ws === socket

        timeoutId = setTimeout(() => {
          console.warn('⏱️ AppSync WebSocket handshake timed out — giving up on this attempt')
          try { socket.close() } catch { /* already gone */ }
          fail(new Error('AppSync WebSocket connection timed out'))
        }, CONNECT_TIMEOUT_MS)

        this.ws.onopen = () => {
          if (!isCurrent()) return
          debug('✅ AppSync Events WebSocket connected')
          // `reconnectAttempts > 0` covers the case where the very first
          // handshake failed and a retry succeeded: subscribers still need the
          // gap-filling refetch even though this is technically the first open.
          const isReconnect = this.hasEverConnected || this.reconnectAttempts > 0
          this.reconnectAttempts = 0
          this.isConnected = true
          this.hasEverConnected = true
          // Replay every registered channel, not only on reconnect. A
          // subscribe() that landed while the socket was down or mid-handshake
          // never got its wire frame sent, and used to stay silently dead for
          // the rest of the page's life.
          this.subscriptions.forEach((_callbacks, channelName) => {
            this.sendSubscribeMessage(channelName)
          })
          if (isReconnect) {
            this.reconnectListeners.forEach(listener => {
              try { listener() } catch (e) { console.error('Reconnect listener error:', e) }
            })
          }
          succeed()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }
        
        this.ws.onclose = (event) => {
          debug('🔌 AppSync Events WebSocket disconnected:', event.code, event.reason)
          if (!isCurrent()) return
          this.isConnected = false
          fail(new Error(`AppSync WebSocket closed before opening (${event.code})`))
          // 1006 (abnormal closure) is what every real network drop looks like,
          // and it is what Safari reports after suspending a backgrounded tab.
          // Excluding it meant the one case that always needs recovery was the
          // one case that never got it.
          if (!this.intentionalClose && event.code !== 1000 && this.subscriptions.size > 0) {
            this.handleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('❌ AppSync Events WebSocket error:', error)
          if (!isCurrent()) return
          this.isConnected = false
          fail(error)
        }
        
      } catch (error) {
        console.error('Error connecting to AppSync Events WebSocket:', error)
        fail(error)
      }
    })
  }

  private handleMessage(raw: unknown) {
    debug('📨 AppSync Events WebSocket message received:', raw)

    // The wire format varies by `type`; narrow once and treat as a loose
    // shape afterwards instead of sprinkling `any` casts.
    if (typeof raw !== 'object' || raw === null) return
    const data = raw as Record<string, unknown> & {
      payload?: { data?: { subscribe?: unknown }; channelName?: string }
      event?: string
      channel?: string
    }

    if (data.type === 'ack') {
      debug('✅ AppSync Events message acknowledged')
      return
    }

    if (data.type === 'error') {
      console.error('❌ AppSync Events error:', data)
      return
    }

    if (data.type === 'data' && data.payload) {
      // Handle incoming events from local AppSync server
      try {
        const eventData = (data.payload.data?.subscribe || data.payload.data) as AppSyncEvent | undefined
        const channelName: string | undefined = data.payload.channelName
        debug('📨 Received local event:', eventData, 'on channel:', channelName)

        if (eventData) {
          this.dispatchEvent(eventData, channelName)
        }
      } catch (error) {
        console.error('Error parsing local event data:', error)
      }
    }

    if (data.type === 'data' && data.event) {
      // Handle incoming events (AWS AppSync Events uses 'data' type with event field)
      try {
        const eventData = JSON.parse(data.event) as AppSyncEvent
        // AWS AppSync Events delivers per-channel; the WS message includes
        // the channel name at the top level on the AWS side.
        const channelName: string | undefined = (() => {
          if (typeof data.channel === 'string') {
            return data.channel.replace(/^\/default\//, '')
          }
          return undefined
        })()
        debug('📨 Received AWS event:', eventData, 'on channel:', channelName)

        this.dispatchEvent(eventData, channelName)
      } catch (error) {
        console.error('Error parsing AWS event data:', error)
      }
    }
    
    if (data.type === 'subscribe_success') {
      debug('✅ Subscription successful:', data)
    }

    if (data.type === 'subscribe_error') {
      console.error('❌ Subscription error:', data)
    }
  }

  // Route an event to subscribers. If the server told us which channel the
  // event belongs to, deliver only to that channel's subscribers. Otherwise
  // fall back to broadcasting (legacy behaviour) so existing chat code keeps
  // working when the server doesn't include channel info.
  private dispatchEvent(eventData: AppSyncEvent, channelName?: string) {
    const fire = (callbacks: Set<AppSyncCallback>, channel: string) => {
      callbacks.forEach(callback => {
        try {
          callback(eventData)
        } catch (error) {
          console.error(`Error in subscription callback for ${channel}:`, error)
        }
      })
    }

    if (channelName) {
      const callbacks = this.subscriptions.get(channelName)
      if (callbacks) fire(callbacks, channelName)
      return
    }

    // The frame did not say which channel it belongs to. Broadcasting to every
    // subscriber — the old behaviour — pushes chat messages into the
    // request-updates handler and request broadcasts into open conversations,
    // so only fall back when there is exactly one possible destination.
    if (this.subscriptions.size === 1) {
      this.subscriptions.forEach((callbacks, cn) => fire(callbacks, cn))
      return
    }
    console.warn('[appsync] dropped an event that carried no channel')
  }

  private send(message: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Not fatal: the wake listeners reset the counter and try again the next
      // time the tab is focused or the network comes back.
      console.error('❌ Max reconnection attempts reached — waiting for focus/online to retry')
      return
    }
    this.reconnectAttempts++
    // Exponential with a cap, plus jitter so every open tab doesn't stampede
    // the endpoint at the same instant after a network blip.
    const backoff = Math.min(
      this.reconnectDelay * 2 ** (this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    )
    const delay = backoff + Math.random() * 500
    debug(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${Math.round(delay)}ms...`)

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, delay)
  }

  subscribe(channelName: string, callback: AppSyncCallback): () => void {
    debug(`📡 Subscribing to channel: ${channelName}`)

    const isFirstSubscriber = !this.subscriptions.has(channelName)
    if (isFirstSubscriber) {
      this.subscriptions.set(channelName, new Set())
    }
    const callbacks = this.subscriptions.get(channelName)!
    callbacks.add(callback)

    // Only send the wire-level subscribe once per channel. Multiple local
    // subscribers share a single server-side subscription.
    if (isFirstSubscriber) {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.sendSubscribeMessage(channelName)
      } else {
        // Not up yet: connect and let onopen replay this channel. Callers no
        // longer need to await connect() before subscribing, so a slow or
        // failed handshake can never block the UI that depends on them.
        this.connect().catch(err => console.error('Subscribe connect failed:', err))
      }
    }

    return () => this.unsubscribeCallback(channelName, callback)
  }

  // Remove a single callback. The server-side subscription is only torn down
  // when the last local subscriber goes away.
  private unsubscribeCallback(channelName: string, callback: AppSyncCallback) {
    const callbacks = this.subscriptions.get(channelName)
    if (!callbacks) return
    callbacks.delete(callback)
    if (callbacks.size === 0) {
      this.subscriptions.delete(channelName)
      this.sendUnsubscribeMessage(channelName)
    }
  }

  // Sends the wire-level subscribe frame for a channel. Extracted so that
  // reconnection logic can replay subscriptions without touching the local
  // callbacks map.
  private sendSubscribeMessage(channelName: string) {
    const defaultChannelName = `/default/${channelName}`
    const isLocal = isMockEndpoint()
    const messageType = isLocal ? 'start' : 'subscribe'

    if (this.isConnected && this.ws) {
      const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      this.subscriptionIds.set(channelName, subscriptionId)
      const subscribeMessage = {
        id: subscriptionId,
        type: messageType,
        ...(isLocal ? {
          payload: {
            data: channelName
          }
        } : {
          channel: defaultChannelName,
          authorization: buildAuthorization()
        })
      }

      debug('📡 Sending subscription message:', subscribeMessage)
      this.send(subscribeMessage)
    }
  }

  // Register a callback that fires every time the WebSocket transitions from
  // disconnected back to connected (excluding the very first connection).
  // Useful for refetching server state to fill any gap that occurred during
  // the outage.
  onReconnect(listener: ReconnectListener): () => void {
    this.reconnectListeners.add(listener)
    return () => {
      this.reconnectListeners.delete(listener)
    }
  }

  // Tear down ALL local subscribers for a channel. Generally prefer the
  // disposer returned by `subscribe()` so individual components don't accidentally
  // unsubscribe each other; this method is kept for legacy chat callsites.
  unsubscribe(channelName: string) {
    debug(`📡 Unsubscribing from channel: ${channelName}`)
    this.subscriptions.delete(channelName)
    this.sendUnsubscribeMessage(channelName)
  }

  private sendUnsubscribeMessage(channelName: string) {
    const id = this.subscriptionIds.get(channelName)
    this.subscriptionIds.delete(channelName)
    if (!this.isConnected || !this.ws) return

    if (isMockEndpoint()) {
      this.send({
        id: id ?? `unsub-${Date.now()}`,
        type: 'stop',
        payload: { data: channelName },
      })
      return
    }

    // AppSync Events keys the teardown off the subscribe frame's id. Without
    // one there is nothing meaningful to send.
    if (!id) return
    this.send({ id, type: 'unsubscribe' })
  }

  // Publish an event to a channel using AppSync Events
  async publishEvent(channelName: string, message: AppSyncEvent): Promise<void> {
    // Server-side publishing goes over HTTP, never this socket: everything
    // below is built for a long-lived browser tab, not a request handler that
    // may be frozen the moment it responds. See src/lib/appsync-publish.ts.
    // The import is dynamic so `jose` and the publish path stay out of the
    // client bundle.
    if (typeof window === 'undefined') {
      const { publishOverHttp } = await import('./appsync-publish')
      await publishOverHttp(channelName, message as Record<string, unknown>)
      return
    }

    // Try to connect if not already connected
    if (!this.isConnected || !this.ws) {
      try {
        await this.connect()
      } catch (error) {
        console.error('Failed to connect to AppSync Events:', error)
        return
      }
    }

    // Use the actual channel name for proper message routing
    const isLocal = isMockEndpoint()
    const publishMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'publish',
      ...(isLocal ? {
        roomId: channelName,
        message: message
      } : {
        channel: `/default/${channelName}`,
        events: [JSON.stringify(message)],
        authorization: buildAuthorization()
      })
    }

    debug('📤 Publishing event to AppSync Events:', publishMessage)
    this.send(publishMessage)
  }

  // Simulate receiving a message (for testing)
  simulateMessage(channelName: string, message: AppSyncEvent) {
    debug(`📨 Simulating message for channel: ${channelName}`)
    const callbacks = this.subscriptions.get(channelName)
    if (callbacks && callbacks.size > 0) {
      debug(`📨 Firing ${callbacks.size} callback(s) for channel: ${channelName}`)
      callbacks.forEach(cb => cb(message))
    } else {
      debug(`📨 No callbacks found for channel: ${channelName}`)
      debug(`📨 Available subscriptions:`, Array.from(this.subscriptions.keys()))
    }
  }

  disconnect() {
    this.intentionalClose = true
    if (this.ws) {
      this.ws.close(1000, 'client disconnect')
      this.ws = null
    }
    this.subscriptions.clear()
    this.subscriptionIds.clear()
    this.isConnected = false
    debug('🔌 AppSync WebSocket disconnected')
  }

  // Reports the socket's real state, not just what the last event said. Safari
  // can leave a suspended socket behind without ever firing onclose, so the
  // flag alone would claim a connection that no longer carries traffic.
  getConnectionStatus(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }
}

// Export singleton instance
export const appSyncService = new AppSyncService()
export default appSyncService
