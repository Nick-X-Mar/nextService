/**
 * Server-side publishing to AppSync Events, over HTTP.
 *
 * The socket path works — Next.js's server runtime supplies a `WebSocket`
 * global even on Node 20, where bare Node has none — but it is the wrong
 * transport for a request handler. `AppSyncService` is a browser singleton: it
 * carries reconnect backoff, wake-on-focus listeners and an 8s handshake
 * timeout, all of which assume a long-lived tab. On Amplify's WEB_COMPUTE
 * runtime the container is short-lived and frozen between invocations, so a
 * cold one pays up to that full handshake inside the user's POST before the
 * message can be acknowledged, and the socket it opens is never torn down.
 *
 * AppSync Events exposes `POST /event` for exactly this case: no handshake, no
 * connection state to keep alive across invocations, and a real status code
 * when a publish is rejected instead of a frame dropped into a closed socket.
 */
import { SignJWT } from 'jose'

/** A stalled publish must never hold the user's POST open. */
const PUBLISH_TIMEOUT_MS = 4000
const SYSTEM_TOKEN_TTL_SECONDS = 300

type Endpoints =
  | { kind: 'mock'; url: string }
  | { kind: 'aws'; url: string; host: string }

/**
 * The local mock (`local-appsync-server.js`) speaks its own `/publish` shape,
 * AppSync speaks `/event`. Both are derived from the configured endpoints
 * rather than from `NODE_ENV`, so pointing a dev server at real AppSync works
 * — the historical `NODE_ENV === 'development'` check silently produced
 * mock-shaped frames against AWS and the subscription never registered.
 */
function resolveEndpoints(): Endpoints | null {
  const wsEndpoint = process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT
  const httpHost = process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT

  if (wsEndpoint && wsEndpoint.includes('localhost:3002')) {
    return { kind: 'mock', url: 'http://localhost:3002/publish' }
  }
  if (!httpHost) return null

  const host = httpHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return { kind: 'aws', url: `https://${host}/event`, host }
}

/**
 * Signs a short-lived `system` token.
 *
 * The authorizer requires a token on every publish. Server code is already the
 * thing that decided the message is legitimate, and it holds the signing
 * secret, so `userType: 'system'` is accepted for any channel.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

async function systemToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value
  }
  const secret = process.env.REALTIME_JWT_SECRET
  if (!secret) {
    console.error('[appsync-publish] REALTIME_JWT_SECRET not set — cannot publish')
    return null
  }
  try {
    const token = await new SignJWT({ userId: 'system', userType: 'system' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('appsync-events')
      .setExpirationTime(`${SYSTEM_TOKEN_TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(secret))
    cachedToken = {
      value: token,
      expiresAt: Date.now() + SYSTEM_TOKEN_TTL_SECONDS * 1000,
    }
    return token
  } catch (err) {
    console.error('[appsync-publish] failed to mint system token', err)
    return null
  }
}

/**
 * Publishes one event to a channel. Resolves `true` only when the event was
 * accepted, so callers can log a real delivery failure instead of assuming
 * every message landed.
 */
export async function publishOverHttp(
  channelName: string,
  message: Record<string, unknown>
): Promise<boolean> {
  const endpoints = resolveEndpoints()
  if (!endpoints) {
    console.error('[appsync-publish] AppSync endpoint not configured — skipping publish')
    return false
  }

  let body: string
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (endpoints.kind === 'mock') {
    body = JSON.stringify({ roomId: channelName, message })
  } else {
    const token = await systemToken()
    if (!token) return false
    headers.Authorization = `Bearer ${token}`
    headers.host = endpoints.host
    body = JSON.stringify({
      channel: `/default/${channelName}`,
      events: [JSON.stringify(message)],
    })
  }

  try {
    const res = await fetch(endpoints.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      // Read the body: AppSync reports per-event failures in a 200 too, and a
      // 401 here means the authorizer rejected the channel — both are things
      // we want in the logs rather than silently dropped.
      const detail = await res.text().catch(() => '')
      console.error(
        `[appsync-publish] publish to ${channelName} failed: ${res.status} ${detail.slice(0, 300)}`
      )
      return false
    }
    return true
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[appsync-publish] publish to ${channelName} errored: ${reason}`)
    return false
  }
}
