/**
 * Push notifications to the browsers and installed apps (the PWA:
 * src/app/manifest.ts, public/sw.js) people allowed them on, through the
 * standard Web Push protocol: one code path reaches Chrome, Edge and Samsung
 * Internet, Firefox, and Safari on the Mac and on an iPhone with the app on
 * its home screen. public/sw.js shows them.
 *
 * Subscriptions are in PushSubscriptions, one row per device, keyed by a hash
 * of its endpoint (`/api/push/subscriptions` writes them). Sending is signed
 * with a VAPID key pair derived from JWT_SECRET, so there is no other secret
 * to provision; rotating JWT_SECRET changes the pair, and every browser then
 * subscribes again on its next visit (src/lib/web-push-client.ts compares the
 * key it subscribed with).
 *
 * Like sendEmail, nothing here throws: a notification that fails must never
 * fail the message, offer or booking it is about. Callers still await it
 * (Amplify freezes the function the moment it responds).
 */
import { createECDH, createHash, hkdfSync } from 'crypto'
import webpush, { WebPushError } from 'web-push'
import { BatchGetCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensurePushSubscriptionsTable } from '@/utils/ensurePushSubscriptionsTable'
import { log } from '@/utils/logger'
import { TABLES } from '@/lib/tables'
import { getCategoryText } from '@/utils/categoryLabels'
import { garageTakesCategory } from '@/types/businessTypes'

export type PushUserType = 'client' | 'garage'

export interface PushMessage {
  title: string
  body: string
  /** A path on the site; tapping the notification opens it. */
  url: string
  /** A later notification with the same tag replaces this one (one per chat). */
  tag?: string
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Who the push services contact if our notifications misbehave (Apple requires one). */
const VAPID_SUBJECT = 'mailto:info@nextservice.gr'

/** A notification the device could not get within a day is no longer news. */
const TTL_SEC = 24 * 60 * 60

/**
 * The push services browsers subscribe with. Anything else is refused: the
 * server POSTs to whatever endpoint is stored, so an open list would let any
 * signed-in user point it at an address of their choosing.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

const userKey = (userType: PushUserType, userId: string) => `${userType}#${userId}`
const subscriptionId = (endpoint: string) => createHash('sha256').update(endpoint).digest('base64url')

// ── Keys ────────────────────────────────────────────────────────────────

let vapid: { publicKey: string; privateKey: string } | null = null

/**
 * The server's VAPID key pair: a P-256 private key derived from JWT_SECRET
 * with HKDF, and its public key, both base64url as web-push takes them.
 */
function vapidKeys(): { publicKey: string; privateKey: string } | null {
  if (vapid) return vapid
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  // A 32-byte value is a valid key unless it is zero or past the curve's
  // order, a 1-in-2^32 chance; the counter just moves on to the next one.
  for (let counter = 0; counter < 8; counter++) {
    const privateKey = Buffer.from(hkdfSync('sha256', secret, 'nextservice', `web-push-vapid-${counter}`, 32))
    try {
      const ecdh = createECDH('prime256v1')
      ecdh.setPrivateKey(privateKey)
      vapid = { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: privateKey.toString('base64url') }
      return vapid
    } catch { /* not a valid key: try the next */ }
  }
  return null
}

/** What browsers subscribe with (`applicationServerKey`). */
export function vapidPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null
}

// ── Subscriptions ───────────────────────────────────────────────────────

function base64urlBytes(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null
  return Buffer.from(value, 'base64url')
}

/** A browser's `PushSubscription.toJSON()`, checked; null when it is not one. */
export function parseSubscription(input: unknown): PushSubscriptionInput | null {
  const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  if (typeof sub?.endpoint !== 'string' || sub.endpoint.length > 1024) return null
  let url: URL
  try { url = new URL(sub.endpoint) } catch { return null }
  if (url.protocol !== 'https:') return null
  if (!PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null

  const p256dh = base64urlBytes(sub.keys?.p256dh)
  const auth = base64urlBytes(sub.keys?.auth)
  // An uncompressed P-256 point, and the 16-byte auth secret.
  if (p256dh?.length !== 65 || p256dh[0] !== 0x04 || auth?.length !== 16) return null
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh as string, auth: sub.keys!.auth as string } }
}

/**
 * This device now gets this account's notifications. The row is keyed by
 * the endpoint, so a device that was someone else's (a shared computer, a
 * sign-out that never reached us) stops getting theirs in the same write.
 */
export async function saveSubscription(userType: PushUserType, userId: string, sub: PushSubscriptionInput): Promise<void> {
  await ensurePushSubscriptionsTable()
  await dynamoDB.send(new PutCommand({
    TableName: TABLES.PushSubscriptions,
    Item: {
      subscriptionId: subscriptionId(sub.endpoint),
      userKey: userKey(userType, userId),
      userType,
      userId,
      endpoint: sub.endpoint,
      keys: sub.keys,
      updatedAt: new Date().toISOString(),
    },
  }))
}

/** Signing out, or turning them off: this device stops getting this account's notifications. */
export async function deleteSubscription(userType: PushUserType, userId: string, endpoint: string): Promise<void> {
  await ensurePushSubscriptionsTable()
  try {
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLES.PushSubscriptions,
      Key: { subscriptionId: subscriptionId(endpoint) },
      // Only our own: the device may already belong to whoever signed in next.
      ConditionExpression: 'userKey = :key',
      ExpressionAttributeValues: { ':key': userKey(userType, userId) },
    }))
  } catch (error) {
    if ((error as Error).name !== 'ConditionalCheckFailedException') throw error
  }
}

async function subscriptionsOf(userType: PushUserType, userId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const page = await dynamoDB.send(new QueryCommand({
      TableName: TABLES.PushSubscriptions,
      IndexName: 'UserSubscriptionsIndex',
      KeyConditionExpression: 'userKey = :key',
      ExpressionAttributeValues: { ':key': userKey(userType, userId) },
      ExclusiveStartKey: startKey,
    }))
    rows.push(...(page.Items ?? []))
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return rows
}

/** A closed account (account/delete): none of its devices hear from us again. */
export async function deleteSubscriptionsOf(userType: PushUserType, userId: string): Promise<void> {
  await ensurePushSubscriptionsTable()
  for (const row of await subscriptionsOf(userType, userId)) {
    await dynamoDB.send(new DeleteCommand({ TableName: TABLES.PushSubscriptions, Key: { subscriptionId: row.subscriptionId } }))
  }
}

// ── Sending ─────────────────────────────────────────────────────────────

/** Every device of one account that allowed notifications. Never throws. */
export async function pushToUser(userType: PushUserType, userId: string, message: PushMessage): Promise<void> {
  try {
    const keys = vapidKeys()
    if (!keys) return
    await ensurePushSubscriptionsTable()
    const rows = await subscriptionsOf(userType, userId)
    const payload = JSON.stringify(message)

    await Promise.all(rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint as string, keys: row.keys as PushSubscriptionInput['keys'] },
          payload,
          {
            vapidDetails: { subject: VAPID_SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: TTL_SEC,
            urgency: 'high',
            timeout: 8000,
          }
        )
      } catch (error) {
        const status = error instanceof WebPushError ? error.statusCode : undefined
        // Unsubscribed, expired, or the browser's data cleared: the row is dead.
        if (status === 404 || status === 410) {
          await dynamoDB.send(new DeleteCommand({ TableName: TABLES.PushSubscriptions, Key: { subscriptionId: row.subscriptionId } }))
          return
        }
        log.warn('[push] A push service refused a notification', {
          error,
          status,
          pushService: new URL(row.endpoint as string).hostname,
          pushError: error instanceof WebPushError ? error.body?.slice(0, 200) : undefined,
        })
      }
    }))
  } catch (error) {
    log.warn('[push] pushToUser failed', { error, userType })
  }
}

/**
 * A new request, to every active garage with notifications on that takes its
 * category (garageTakesCategory), as the new-request email Lambda does by
 * email. Only the category and the car: this goes out before anyone has won
 * the job.
 *
 * Scans PushSubscriptions for garage rows: one row per device a garage
 * allowed notifications on, a few dozen at most for a long time yet.
 */
export async function pushNewRequestToGarages(requestId: string): Promise<void> {
  try {
    if (!vapidKeys()) return
    await ensurePushSubscriptionsTable()

    const request = (await dynamoDB.send(new GetCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      ProjectionExpression: 'category, vehicleId',
    }))).Item
    if (!request) return
    const vehicle = request.vehicleId
      ? (await dynamoDB.send(new GetCommand({
          TableName: TABLES.Vehicles,
          Key: { id: request.vehicleId },
          ProjectionExpression: 'brand, model',
        }))).Item
      : undefined

    const rows: Record<string, unknown>[] = []
    let startKey: Record<string, unknown> | undefined
    do {
      const page = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.PushSubscriptions,
        FilterExpression: 'userType = :garage',
        ExpressionAttributeValues: { ':garage': 'garage' },
        ProjectionExpression: 'userId',
        ExclusiveStartKey: startKey,
      }))
      rows.push(...(page.Items ?? []))
      startKey = page.LastEvaluatedKey
    } while (startKey)
    const garageIds = [...new Set(rows.map((row) => row.userId as string))]
    if (garageIds.length === 0) return

    const garages: Record<string, unknown>[] = []
    for (let i = 0; i < garageIds.length; i += 100) {
      const res = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.Garages]: {
            Keys: garageIds.slice(i, i + 100).map((id) => ({ id })),
            ProjectionExpression: 'id, isActive, businessTypes, anonymizedAt',
          },
        },
      }))
      garages.push(...(res.Responses?.[TABLES.Garages] ?? []))
    }
    const takers = garages.filter((g) =>
      g.isActive === true && !g.anonymizedAt && garageTakesCategory(g.businessTypes, request.category)
    )

    const car = [vehicle?.brand, vehicle?.model].filter(Boolean).join(' ')
    const category = getCategoryText(request.category)
    await Promise.all(takers.map((g) =>
      pushToUser('garage', g.id as string, {
        title: 'Νέο αίτημα',
        body: car ? `${category} · ${car}` : category,
        url: `/garage-dashboard/${g.id}/offers/${requestId}/`,
        tag: `request-${requestId}`,
      })
    ))
  } catch (error) {
    log.warn('[push] pushNewRequestToGarages failed', { error, requestId })
  }
}
