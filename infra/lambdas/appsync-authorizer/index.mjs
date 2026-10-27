/**
 * Lambda authorizer for the AppSync Events API.
 *
 * Before this existed the API used API_KEY auth for connect, subscribe AND
 * publish, and that key ships in the browser bundle as
 * NEXT_PUBLIC_APPSYNC_API_KEY. Anyone who viewed the site could therefore
 * subscribe to any channel and read private client↔garage conversations in real
 * time, or publish forged messages into them. The REST API's ownership checks
 * were simply bypassed by talking to the WebSocket directly.
 *
 * This authorizer closes that: the browser presents a short-lived token from
 * `/api/realtime/token`, and every step is decided on its operation AND the
 * channel it names:
 *
 *   - CONNECT    any valid token. AppSync sends no channel for this step.
 *   - PUBLISH    `system` only: the app server, once its REST layer has
 *                authorized the write (src/lib/appsync-publish.ts). No browser
 *                publishes anything. A user token that could would let any
 *                approved garage forge `request-updates` and drop requests off
 *                competitors' dashboards, or forge messages into its threads.
 *   - SUBSCRIBE  `request/{requestId}/garage/{garageId}`: the approved garage
 *                named in it, or the client that owns the request (looked up in
 *                ServiceRequests). `new-requests` / `request-updates`: approved
 *                garages only.
 *
 * Anything else is refused: an unknown operation, a subscribe or publish with
 * no channel, a channel outside the `default` namespace, a wildcard.
 *
 * AppSync documents the request as `requestContext.operation`
 * (EVENT_CONNECT | EVENT_SUBSCRIBE | EVENT_PUBLISH) and `requestContext.channel`
 * (`/default/<path>`, null on CONNECT). The extraction below still tolerates
 * near variants, and logs what it saw whenever it cannot place an event, so a
 * shape change shows up in CloudWatch as a refusal with a reason rather than
 * as an open door.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const REQUESTS_TABLE = process.env.SERVICE_REQUESTS_TABLE || 'ServiceRequests'
const GARAGES_TABLE = process.env.GARAGES_TABLE || 'Garages'
const SECRET = process.env.REALTIME_JWT_SECRET
const NAMESPACE = 'default'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

/**
 * Per-container caches, so a burst of subscribes isn't N reads. Only a cached
 * answer that ALLOWS is trusted; anything else is read again before it
 * refuses, so a garage approved a moment ago — or an account a guest's
 * requests were just merged into — is not turned away for the cache's
 * lifetime. The active flag's window matches requireActiveGarage's 30s.
 */
const ownerCache = new Map()
const OWNER_TTL_MS = 60_000
const activeGarageCache = new Map()
const ACTIVE_TTL_MS = 30_000
const MAX_CACHE_ENTRIES = 5000

function remember(cache, key, entry) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
  cache.set(key, entry)
}

const b64urlToBuf = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/**
 * Verifies an HS256 JWT. Implemented directly rather than pulling a library in
 * so the deployment package stays dependency-light.
 */
function verifyToken(token) {
  if (!SECRET) throw new Error('REALTIME_JWT_SECRET is not set')
  if (typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts

  let header
  try {
    header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'))
  } catch {
    return null
  }
  // Reject anything that isn't HS256 — notably "none", which would otherwise
  // let a caller present an unsigned token.
  if (header.alg !== 'HS256') return null

  const expected = createHmac('sha256', SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  const provided = b64urlToBuf(signatureB64)
  if (expected.length !== provided.length) return null
  if (!timingSafeEqual(expected, provided)) return null

  let payload
  try {
    payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'))
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null
  // Audience pins the token to this use. A session token, if the secrets were
  // ever unified by mistake, would not carry it.
  if (payload.aud !== 'appsync-events') return null
  if (!payload.userId || !payload.userType) return null

  return payload
}

function extractToken(event) {
  const auth = event?.authorization || event?.request?.headers || event?.headers || {}
  const raw =
    auth.Authorization ??
    auth.authorization ??
    event?.authorizationToken ??
    null
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  return value.startsWith('Bearer ') ? value.slice(7) : value
}

/** `EVENT_SUBSCRIBE` (or a bare `SUBSCRIBE`) → `SUBSCRIBE`; anything unknown → null. */
function extractOperation(event) {
  const ctx = event?.requestContext || {}
  const raw = ctx.operation ?? ctx.operationType ?? event?.operation ?? null
  if (typeof raw !== 'string') return null
  const op = raw.toUpperCase().replace(/^EVENT_/, '')
  return op === 'CONNECT' || op === 'SUBSCRIBE' || op === 'PUBLISH' ? op : null
}

function extractChannel(event) {
  const ctx = event?.requestContext || {}
  return ctx.channel || ctx.channelName || event?.channel || null
}

/**
 * `/default/<path>` → `<path>` (its segments after the namespace, joined by
 * `/`), or null for anything this API does not serve.
 */
function channelName(channel) {
  if (typeof channel !== 'string') return null
  const segments = channel.split('/').filter(Boolean)
  // The namespace prefix is what AppSync sends. A path without it is judged by
  // exactly the same rules, so a shape change cannot quietly refuse every
  // channel; anything else that comes out of this matches no rule below.
  const path = segments[0] === NAMESPACE ? segments.slice(1) : segments
  if (path.length === 0) return null
  // AppSync accepts `*` in a subscribe. Nothing in the app subscribes that
  // way, and a pattern would be judged on its literal text rather than on
  // every channel it goes on to match.
  if (path.some((s) => s.includes('*'))) return null
  return path.join('/')
}

/**
 * `request/{requestId}/garage/{garageId}` → its two ids. Same shape as
 * `chatChannel()` in src/lib/realtime-channels.ts: AppSync caps a segment at
 * 50 characters, so the ids each get their own instead of one long name.
 */
function parseRequestChannel(name) {
  const match = name.match(/^request\/([A-Za-z0-9-]+)\/garage\/([A-Za-z0-9-]+)$/)
  if (!match) return null
  return { requestId: match[1], garageId: match[2] }
}

async function ownsRequest(clientId, requestId) {
  const cached = ownerCache.get(requestId)
  if (cached && cached.at > Date.now() - OWNER_TTL_MS && cached.clientId === clientId) return true

  const res = await ddb.send(
    new GetCommand({
      TableName: REQUESTS_TABLE,
      Key: { id: requestId },
      ProjectionExpression: 'clientId',
    })
  )
  const owner = res.Item?.clientId ?? null
  remember(ownerCache, requestId, { clientId: owner, at: Date.now() })
  return !!owner && owner === clientId
}

/**
 * Every garage subscription — the broadcast fan-out and its own chat threads
 * alike — needs an approved garage. A deactivated garage still holds a valid
 * token for up to its 15-minute life, and its threads carry client messages.
 */
async function isActiveGarage(garageId) {
  const cached = activeGarageCache.get(garageId)
  if (cached && cached.at > Date.now() - ACTIVE_TTL_MS && cached.active) return true

  const res = await ddb.send(
    new GetCommand({
      TableName: GARAGES_TABLE,
      Key: { id: garageId },
      ProjectionExpression: 'isActive',
    })
  )
  const active = res.Item?.isActive === true
  remember(activeGarageCache, garageId, { active, at: Date.now() })
  return active
}

/**
 * Fan-out channels that are not tied to a single request. `new-requests`
 * carries request details and presigned photo URLs, `request-updates` request
 * ids and statuses — both for approved garages only, never for a client token.
 */
const BROADCAST_CHANNELS = new Set(['new-requests', 'request-updates'])

async function maySubscribe(claims, name) {
  if (BROADCAST_CHANNELS.has(name)) {
    return claims.userType === 'garage' && (await isActiveGarage(claims.userId))
  }

  const parsed = parseRequestChannel(name)
  if (!parsed) {
    console.warn('[authorizer] unrecognised channel', JSON.stringify({ channel: name }))
    return false
  }
  if (claims.userType === 'garage') {
    return parsed.garageId === claims.userId && (await isActiveGarage(claims.userId))
  }
  if (claims.userType === 'client') {
    return ownsRequest(claims.userId, parsed.requestId)
  }
  // `system` publishes; it has no reason to listen, so a leaked system token
  // cannot be used to read every conversation either.
  return false
}

// Every decision is returned with `ttlOverride: 0`. A cached "allow" outlives
// the facts it was based on — a garage deactivated, a request reassigned —
// for as long as the cache holds it, and a cached CONNECT result is keyed
// without a channel at all. Matches `authorizer_result_ttl_in_seconds=0` in
// appsync_stack.py.
const NO_CACHE = 0
const decide = (isAuthorized) => ({ isAuthorized, ttlOverride: NO_CACHE })

/** What was received, minus the credential — for the CloudWatch trail. */
function describe(event) {
  const ctx = event?.requestContext || {}
  return JSON.stringify({ operation: ctx.operation ?? null, channel: ctx.channel ?? null, keys: Object.keys(ctx) })
}

export const handler = async (event) => {
  try {
    const claims = verifyToken(extractToken(event))
    if (!claims) return decide(false)

    const operation = extractOperation(event)
    if (operation === 'CONNECT') {
      // A valid token opens the socket; nothing can be read or sent on it
      // until each subscribe and publish passes below.
      return decide(true)
    }
    if (!operation) {
      console.warn('[authorizer] unrecognised operation — refusing', describe(event))
      return decide(false)
    }

    // A subscribe or publish must name a channel. This used to be read as
    // "no channel means CONNECT" and allowed, which made any event that
    // arrived without one an open door.
    const name = channelName(extractChannel(event))
    if (!name) {
      console.warn(`[authorizer] ${operation} without a usable channel — refusing`, describe(event))
      return decide(false)
    }

    if (operation === 'PUBLISH') return decide(claims.userType === 'system')
    return decide(await maySubscribe(claims, name))
  } catch (err) {
    // Fail closed. An authorizer that errors open would silently restore the
    // exact hole this exists to close.
    console.error('[authorizer] error', err)
    return decide(false)
  }
}
