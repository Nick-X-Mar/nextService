import { createHash, randomBytes } from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Fixtures for the guest → account merge flow (agent A).
 *
 * Two states the app deliberately cannot be asked to produce:
 *  - a *guest*: a Clients row without email or password. The funnel stopped
 *    creating those, so a test registers normally and strips the credentials.
 *  - the raw confirmation token: it only ever exists inside the email, and
 *    local email sending is off. Rather than add an endpoint that hands tokens
 *    out, the test swaps the hash the app stored for the hash of a token it
 *    knows — the app's own validation path then runs unchanged.
 *
 * Local only: DynamoDB Local with dummy credentials.
 */
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

const BASE_URL = 'http://localhost:3000'

export async function getRow(table: string, id: string): Promise<Record<string, unknown> | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { id }, ConsistentRead: true }))
  return res.Item
}

/** Turns a freshly registered client into a pre-2026 guest (no credentials). */
export async function makeLegacyGuest(clientId: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: 'Clients',
      Key: { id: clientId },
      UpdateExpression: 'SET firstName = :guest REMOVE email, passwordHash, acceptedTermsAt, acceptedTermsVersion',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: { ':guest': 'Επισκέπτης' },
    })
  )
}

export async function setClientFields(clientId: string, fields: Record<string, string>): Promise<void> {
  const names = Object.keys(fields)
  await ddb.send(
    new UpdateCommand({
      TableName: 'Clients',
      Key: { id: clientId },
      UpdateExpression: `SET ${names.map((n) => `#${n} = :${n}`).join(', ')}`,
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: Object.fromEntries(names.map((n) => [`#${n}`, n])),
      ExpressionAttributeValues: Object.fromEntries(names.map((n) => [`:${n}`, fields[n]])),
    })
  )
}

/**
 * Replaces the pending-merge token hash the app stored with one whose raw
 * token the test holds. Refuses unless the app actually stored a pending merge.
 */
export async function plantMergeToken(guestId: string): Promise<{ token: string; stored: Record<string, unknown> }> {
  const stored = await getRow('Clients', guestId)
  if (!stored || typeof stored.mergeTokenHash !== 'string') {
    throw new Error(`No pending merge stored on ${guestId}`)
  }
  const token = randomBytes(32).toString('hex')
  await ddb.send(
    new UpdateCommand({
      TableName: 'Clients',
      Key: { id: guestId },
      UpdateExpression: 'SET mergeTokenHash = :hash',
      ConditionExpression: 'mergeTokenHash = :current',
      ExpressionAttributeValues: {
        ':hash': createHash('sha256').update(token).digest('hex'),
        ':current': stored.mergeTokenHash,
      },
    })
  )
  return { token, stored }
}

/** Moves a pending merge past its expiry and past the re-send cooldown. */
export async function ageMergeLink(guestId: string): Promise<void> {
  const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  await ddb.send(
    new UpdateCommand({
      TableName: 'Clients',
      Key: { id: guestId },
      UpdateExpression: 'SET mergeExpiresAt = :past, mergeRequestedAt = :past',
      ConditionExpression: 'attribute_exists(mergeTokenHash)',
      ExpressionAttributeValues: { ':past': past },
    })
  )
}

export interface ApiResult {
  status: number
  data: Record<string, unknown>
  /** The auth-token value from Set-Cookie, if the response set one. */
  authToken: string | null
  setCookie: string[]
}

/**
 * A cookie-jar-free call: exactly the cookie passed is sent, and whatever the
 * response sets is reported rather than silently carried into the next call.
 */
export async function api(
  path: string,
  { method = 'GET', cookie, body }: { method?: string; cookie?: string; body?: unknown } = {}
): Promise<ApiResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: `auth-token=${cookie}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie()
  const authCookie = setCookie.find((c) => c.startsWith('auth-token='))
  const value = authCookie ? authCookie.slice('auth-token='.length).split(';')[0] : ''
  return {
    status: res.status,
    data: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    authToken: value || null,
    setCookie,
  }
}

const vehicleBody = (overrides: Record<string, unknown> = {}) => ({
  category: 'allagi-ladion',
  description: 'E2E merge fixture',
  brand: 'Toyota',
  model: 'Corolla',
  modelYear: '2018',
  engineCC: '1600',
  fuelType: 'petrol',
  isAutomatic: false,
  is4x4: false,
  ...overrides,
})

/** Registers a client through the inline funnel and returns its session + first request. */
export async function createClientWithRequest(
  email: string,
  password: string,
  vehicle: Record<string, unknown> = {}
): Promise<{ clientId: string; token: string; requestId: string; vehicleId: string }> {
  const res = await api('/api/service-request/', {
    method: 'POST',
    body: { ...vehicleBody(vehicle), email, password, acceptedTerms: true },
  })
  if (res.status !== 200 || !res.authToken) {
    throw new Error(`service-request failed: ${res.status} ${JSON.stringify(res.data)}`)
  }
  return {
    clientId: res.data.clientId as string,
    token: res.authToken,
    requestId: res.data.serviceRequestId as string,
    vehicleId: res.data.vehicleId as string,
  }
}

/** Files another request inside an existing session. */
export async function addRequest(
  token: string,
  vehicle: Record<string, unknown> = {}
): Promise<{ requestId: string; vehicleId: string }> {
  const res = await api('/api/service-request/', { method: 'POST', cookie: token, body: vehicleBody(vehicle) })
  if (res.status !== 200) throw new Error(`service-request failed: ${res.status} ${JSON.stringify(res.data)}`)
  return { requestId: res.data.serviceRequestId as string, vehicleId: res.data.vehicleId as string }
}

/** EmailLogs rows for one garage and template (local emails are logged as `skipped`). */
export async function emailLogsFor(garageId: string, templateName: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: 'EmailLogs',
        FilterExpression: 'garageId = :g AND templateName = :t',
        ExpressionAttributeValues: { ':g': garageId, ':t': templateName },
        ExclusiveStartKey,
      })
    )
    rows.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return rows
}

/** Registers a garage, which starts out pending admin approval. */
export async function registerPendingGarage(tag: string) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const tin = stamp.slice(-9)
  const profile = {
    companyName: `E2E Συνεργείο ${tag}`,
    contactFirstName: 'Νίκος',
    contactLastName: 'Δοκιμή',
    tin,
    email: `e2e-garage-${tag}-${stamp}@test.com`,
    password: 'TestPass123',
    taxAuthority: 'Α΄ Αθηνών',
    address: 'Πανεπιστημίου 1, Αθήνα',
    mobile: `69${stamp.slice(-8)}`,
    acceptedTerms: true,
  }
  const res = await api('/api/auth/register-professional/', { method: 'POST', body: profile })
  if (res.status !== 200 || !res.authToken) {
    throw new Error(`register-professional failed: ${res.status} ${JSON.stringify(res.data)}`)
  }
  return { garageId: (res.data.garage as { id: string }).id, token: res.authToken, profile }
}

/** Admin session cookie value (seeded admin — see scripts/seed-admin.ts). */
export async function adminSession(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/admin/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@nextservice.gr',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    }),
  })
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('ns-admin-session='))
  if (!res.ok || !cookie) throw new Error(`admin login failed: ${res.status}`)
  return cookie.split(';')[0]
}

export async function adminPost(path: string, adminCookie: string): Promise<number> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { Cookie: adminCookie } })
  return res.status
}
