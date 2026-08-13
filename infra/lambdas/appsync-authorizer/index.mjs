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
 * `/api/realtime/token`, and every subscribe/publish is checked against the
 * channel it names.
 *
 * Channel convention: `request-{requestId}-garage-{garageId}`
 *   - a garage may only touch channels whose garageId is its own id
 *   - a client may only touch channels for a request it owns (looked up in the
 *     ServiceRequests table)
 *
 * NOTE: AppSync passes the operation and channel in `requestContext`. The exact
 * field names have varied across releases, so the extraction below is
 * defensive and logs the raw event when it cannot find them — check CloudWatch
 * after the first deploy and tighten this once the real shape is confirmed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'

const REGION = process.env.AWS_REGION || 'eu-central-1'
const REQUESTS_TABLE = process.env.SERVICE_REQUESTS_TABLE || 'ServiceRequests'
const SECRET = process.env.REALTIME_JWT_SECRET

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

/** Cache request→clientId briefly so a burst of subscribes isn't N reads. */
const ownerCache = new Map()
const OWNER_TTL_MS = 60_000

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

/**
 * `request-{requestId}-garage-{garageId}` → its two ids.
 *
 * The first group is non-greedy on purpose. Garage ids are themselves prefixed
 * `garage-`, so a real channel reads `request-sr-X-garage-garage-Y`. A greedy
 * first group swallows up to the LAST `-garage-`, yielding a garageId with the
 * prefix stripped — which never equals the caller's id, so every garage was
 * denied access to its own channel.
 */
function parseChannel(channel) {
  if (typeof channel !== 'string') return null
  const name = channel.split('/').filter(Boolean).pop() || ''
  const match = name.match(/^request-(.+?)-garage-(.+)$/)
  if (!match) return null
  return { requestId: match[1], garageId: match[2] }
}

async function requestOwner(requestId) {
  const cached = ownerCache.get(requestId)
  if (cached && cached.at > Date.now() - OWNER_TTL_MS) return cached.clientId

  const res = await ddb.send(
    new GetCommand({
      TableName: REQUESTS_TABLE,
      Key: { id: requestId },
      ProjectionExpression: 'clientId',
    })
  )
  const clientId = res.Item?.clientId ?? null
  ownerCache.set(requestId, { clientId, at: Date.now() })
  return clientId
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

function extractChannel(event) {
  const ctx = event?.requestContext || {}
  return ctx.channel || ctx.channelName || event?.channel || null
}

export const handler = async (event) => {
  try {
    const token = extractToken(event)
    const claims = verifyToken(token)
    if (!claims) {
      return { isAuthorized: false }
    }

    const channel = extractChannel(event)

    // No channel in the payload means this is the CONNECT step. A valid token
    // is enough to open the socket; every subscribe and publish is still
    // authorized individually below.
    if (!channel) {
      return { isAuthorized: true, ttlOverride: 300 }
    }

    const parsed = parseChannel(channel)
    if (!parsed) {
      console.warn('[authorizer] unrecognised channel', JSON.stringify({ channel }))
      return { isAuthorized: false }
    }

    // The application server publishes chat messages and request broadcasts on
    // behalf of users it has already authorized through the REST layer. It
    // holds the signing secret, so a valid 'system' token can only have come
    // from our own backend.
    if (claims.userType === 'system') {
      return { isAuthorized: true, ttlOverride: 60 }
    }

    if (claims.userType === 'garage') {
      return { isAuthorized: parsed.garageId === claims.userId, ttlOverride: 300 }
    }

    if (claims.userType === 'client') {
      const ownerId = await requestOwner(parsed.requestId)
      return { isAuthorized: !!ownerId && ownerId === claims.userId, ttlOverride: 300 }
    }

    return { isAuthorized: false }
  } catch (err) {
    // Fail closed. An authorizer that errors open would silently restore the
    // exact hole this exists to close.
    console.error('[authorizer] error', err)
    return { isAuthorized: false }
  }
}
