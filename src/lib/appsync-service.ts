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
    const res = await fetch('/api/realtime/token/', { credentials: 'include' })
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

class AppSyncService {
  private ws: WebSocket | null = null
  // Multiple components can listen on the same channel (e.g. the dashboard
  // page tracks the badge while the AvailableRequests tab tracks the list).
  // A Set per channel lets each subscriber be removed independently.
  private subscriptions: Map<string, Set<AppSyncCallback>> = new Map()
  private reconnectListeners: Set<ReconnectListener> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false
  private hasEverConnected = false

  async connect(): Promise<void> {
    // Obtained before opening the socket: the authorizer rejects the
    // connection without it.
    const realtimeAuth = await getRealtimeToken()
    return new Promise((resolve, reject) => {
      try {
        const endpoint = process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT
        const apiKey = process.env.NEXT_PUBLIC_APPSYNC_API_KEY
        const graphqlEndpoint = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT
        
        console.log('🔌 AppSync Environment Variables:')
        console.log('  WEBSOCKET_ENDPOINT:', endpoint)
        console.log('  API_KEY:', apiKey ? 'SET' : 'NOT SET')
        console.log('  GRAPHQL_ENDPOINT:', graphqlEndpoint)
        
        if (!endpoint || !apiKey || !graphqlEndpoint) {
          throw new Error('AppSync configuration missing')
        }

        console.log('🔌 Connecting to AppSync Events WebSocket:', endpoint)
        
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
        const isLocal = endpoint.includes('localhost:3002')
        const wsUrl = isLocal ? endpoint : `${endpoint}/event/realtime`
        console.log('🔌 AppSync Events WebSocket URL:', wsUrl)
        
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
        
        this.ws.onopen = () => {
          console.log('✅ AppSync Events WebSocket connected')
          const isReconnect = this.hasEverConnected
          this.reconnectAttempts = 0
          this.isConnected = true
          this.hasEverConnected = true
          // Resubscribe to any channels the app had registered before the
          // disconnect, so subscribers don't have to manually re-bind.
          if (isReconnect) {
            const channels = Array.from(this.subscriptions.keys())
            channels.forEach(channelName => {
              this.sendSubscribeMessage(channelName)
            })
            this.reconnectListeners.forEach(listener => {
              try { listener() } catch (e) { console.error('Reconnect listener error:', e) }
            })
          }
          resolve()
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
          console.log('🔌 AppSync Events WebSocket disconnected:', event.code, event.reason)
          this.isConnected = false
          // Don't auto-reconnect on connection errors to avoid loops
          if (event.code !== 1000 && event.code !== 1006) {
            this.handleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          console.error('❌ AppSync Events WebSocket error:', error)
          this.isConnected = false
          reject(error)
        }
        
      } catch (error) {
        console.error('Error connecting to AppSync Events WebSocket:', error)
        reject(error)
      }
    })
  }

  private handleMessage(raw: unknown) {
    console.log('📨 AppSync Events WebSocket message received:', raw)

    // The wire format varies by `type`; narrow once and treat as a loose
    // shape afterwards instead of sprinkling `any` casts.
    if (typeof raw !== 'object' || raw === null) return
    const data = raw as Record<string, unknown> & {
      payload?: { data?: { subscribe?: unknown }; channelName?: string }
      event?: string
      channel?: string
    }

    if (data.type === 'ack') {
      console.log('✅ AppSync Events message acknowledged')
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
        console.log('📨 Received local event:', eventData, 'on channel:', channelName)

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
        console.log('📨 Received AWS event:', eventData, 'on channel:', channelName)

        this.dispatchEvent(eventData, channelName)
      } catch (error) {
        console.error('Error parsing AWS event data:', error)
      }
    }
    
    if (data.type === 'subscribe_success') {
      console.log('✅ Subscription successful:', data)
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

    if (channelName && this.subscriptions.has(channelName)) {
      fire(this.subscriptions.get(channelName)!, channelName)
      return
    }

    this.subscriptions.forEach((callbacks, cn) => fire(callbacks, cn))
  }

  private send(message: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error)
        })
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('❌ Max reconnection attempts reached')
    }
  }

  subscribe(channelName: string, callback: AppSyncCallback): () => void {
    console.log(`📡 Subscribing to channel: ${channelName}`)

    const isFirstSubscriber = !this.subscriptions.has(channelName)
    if (isFirstSubscriber) {
      this.subscriptions.set(channelName, new Set())
    }
    const callbacks = this.subscriptions.get(channelName)!
    callbacks.add(callback)

    // Only send the wire-level subscribe once per channel. Multiple local
    // subscribers share a single server-side subscription.
    if (isFirstSubscriber) {
      this.sendSubscribeMessage(channelName)
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
    const isLocal = process.env.NODE_ENV === 'development'
    const messageType = isLocal ? 'start' : 'subscribe'

    if (this.isConnected && this.ws) {
      const subscribeMessage = {
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

      console.log('📡 Sending subscription message:', subscribeMessage)
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
    console.log(`📡 Unsubscribing from channel: ${channelName}`)
    this.subscriptions.delete(channelName)
    this.sendUnsubscribeMessage(channelName)
  }

  private sendUnsubscribeMessage(channelName: string) {
    const isLocal = process.env.NODE_ENV === 'development'
    if (isLocal && this.isConnected && this.ws) {
      const unsubscribeMessage = {
        id: `unsub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'stop',
        payload: {
          data: channelName
        }
      }
      console.log('📡 Sending unsubscribe message:', unsubscribeMessage)
      this.send(unsubscribeMessage)
    }
  }

  // Publish an event to a channel using AppSync Events
  async publishEvent(channelName: string, message: AppSyncEvent): Promise<void> {
    // Try to connect if not already connected
    if (!this.isConnected || !this.ws) {
      console.log('📡 WebSocket not connected, attempting to connect...')
      try {
        await this.connect()
      } catch (error) {
        console.error('Failed to connect to AppSync Events:', error)
        return
      }
    }

    // Use the actual channel name for proper message routing
    const isLocal = process.env.NODE_ENV === 'development'
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

    console.log('📤 Publishing event to AppSync Events:', publishMessage)
    this.send(publishMessage)
  }

  // Simulate receiving a message (for testing)
  simulateMessage(channelName: string, message: AppSyncEvent) {
    console.log(`📨 Simulating message for channel: ${channelName}`)
    const callbacks = this.subscriptions.get(channelName)
    if (callbacks && callbacks.size > 0) {
      console.log(`📨 Firing ${callbacks.size} callback(s) for channel: ${channelName}`)
      callbacks.forEach(cb => cb(message))
    } else {
      console.log(`📨 No callbacks found for channel: ${channelName}`)
      console.log(`📨 Available subscriptions:`, Array.from(this.subscriptions.keys()))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.subscriptions.clear()
    this.isConnected = false
    console.log('🔌 AppSync WebSocket disconnected')
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }
}

// Export singleton instance
export const appSyncService = new AppSyncService()
export default appSyncService
