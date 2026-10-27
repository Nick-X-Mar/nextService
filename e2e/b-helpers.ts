import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { APIRequestContext, Page } from '@playwright/test'
import { loginViaAPI, registerClient, setAuthCookie } from './helpers'

/**
 * Direct reads of DynamoDB Local for the request-funnel specs: "nothing was written"
 * can only be asserted against the tables themselves, never through an API that
 * might simply not show the row.
 *
 * Local only: it points at DynamoDB Local with dummy credentials.
 */
const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

async function scanAll(table: string, filter: string, values: Record<string, unknown>, names?: Record<string, string>) {
  const items: Record<string, unknown>[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const page = await db.send(new ScanCommand({
      TableName: table,
      FilterExpression: filter,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ExclusiveStartKey,
    }))
    items.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

/** Every request whose description carries `marker` — guests have no clientId to query on. */
export function requestsWithDescription(marker: string) {
  return scanAll('ServiceRequests', 'contains(description, :m)', { ':m': marker })
}

/** Every vehicle whose model is exactly `model`. */
export function vehiclesWithModel(model: string) {
  return scanAll('Vehicles', '#model = :m', { ':m': model }, { '#model': 'model' })
}

export async function requestsForClient(clientId: string) {
  const res = await db.send(new QueryCommand({
    TableName: 'ServiceRequests',
    IndexName: 'ClientRequestsIndex',
    KeyConditionExpression: 'clientId = :c',
    ExpressionAttributeValues: { ':c': clientId },
  }))
  return res.Items ?? []
}

export async function clientsWithEmail(email: string) {
  const res = await db.send(new QueryCommand({
    TableName: 'Clients',
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': email },
  }))
  return res.Items ?? []
}

export async function getRow(table: string, id: string) {
  const res = await db.send(new GetCommand({ TableName: table, Key: { id } }))
  return res.Item
}

/**
 * Points a vehicle at an S3 key without uploading anything — enough for the routes
 * that presign it, and it keeps these specs off AWS.
 */
export async function setLicensePhotoKey(vehicleId: string, key: string) {
  await db.send(new UpdateCommand({
    TableName: 'Vehicles',
    Key: { id: vehicleId },
    UpdateExpression: 'SET licensePhotoUrl = :k',
    ExpressionAttributeValues: { ':k': key },
  }))
}

/** Writes fields straight onto a row this spec created — to stage legacy or in-flight states. */
async function setFields(table: string, id: string, fields: Record<string, unknown>) {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const sets = Object.entries(fields).map(([field, value], i) => {
    names[`#f${i}`] = field
    values[`:v${i}`] = value
    return `#f${i} = :v${i}`
  })
  await db.send(new UpdateCommand({
    TableName: table,
    Key: { id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
}

export const setVehicleFields = (vehicleId: string, fields: Record<string, unknown>) =>
  setFields('Vehicles', vehicleId, fields)

export const setClientFields = (clientId: string, fields: Record<string, unknown>) =>
  setFields('Clients', clientId, fields)

export const setRequestFields = (requestId: string, fields: Record<string, unknown>) =>
  setFields('ServiceRequests', requestId, fields)

export const setChatMessageFields = (messageId: string, fields: Record<string, unknown>) =>
  setFields('ChatMessages', messageId, fields)

export const uniqueMarker = (label: string) => `e2e-B-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

type PlaywrightLike = { request: { newContext: (o: { baseURL: string }) => Promise<APIRequestContext> } }

/**
 * A fresh client with its own request context (its cookie jar is that client's
 * session), and optionally a browser page signed in as it.
 */
export async function freshClient(playwright: PlaywrightLike, label: string, page?: Page) {
  const api = await newGuest(playwright)
  const email = `e2e-b-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`
  const password = 'TestPass123'
  const reg = await registerClient(api, email, password)
  const { token } = await loginViaAPI(api, email, password, 'client')
  if (page) {
    await setAuthCookie(page, token)
    await page.goto('/')
    await page.evaluate((id: string) => {
      localStorage.setItem('clientId', id)
      localStorage.setItem('userType', 'client')
    }, reg.client.id)
  }
  return { api, email, password, token, clientId: reg.client.id as string }
}

/** A complete non-bodywork request body, as the form would send it. */
export function mechanicalRequest(overrides: Record<string, unknown> = {}) {
  return {
    category: 'symplektis',
    description: 'E2E B request',
    brand: 'Peugeot',
    model: '206',
    modelYear: '2006',
    engineCC: '1400',
    fuelType: 'petrol',
    isAutomatic: false,
    is4x4: false,
    isTurbo: false,
    ...overrides,
  }
}

const FORM_KEY = 'nextservice-form-data'

/** Seeds the request draft the way step 1 leaves it, then opens `path`. */
/** formStorage's per-tab guest id (`guestOwner()`), kept in sessionStorage. */
const GUEST_OWNER_KEY = 'nextservice-guest-owner'

/**
 * Writes a draft, then opens `path`. `owner: 'guest'` means "this tab's own
 * anonymous visitor": the tab's guest id is pinned to 'guest' so the draft is
 * theirs. Any other owner is somebody else's draft left in the browser.
 */
export async function seedDraft(page: Page, draft: Record<string, unknown>, path: string) {
  await page.goto('/')
  await page.evaluate(
    ([key, value, guestKey, isOwnGuest]) => {
      localStorage.setItem(key, value)
      if (isOwnGuest) sessionStorage.setItem(guestKey, 'guest')
    },
    [FORM_KEY, JSON.stringify(draft), GUEST_OWNER_KEY, draft.owner === 'guest'] as const
  )
  await page.goto(path)
}

export async function readDraft(page: Page): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), FORM_KEY)
  return raw ? JSON.parse(raw) : null
}

/** Smallest valid PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * A request context with an empty cookie jar. The `request` fixture keeps the
 * auth-token from any register/login call made earlier in the same test, so a
 * "guest" POST through it would quietly be an authenticated one.
 */
export async function newGuest(playwright: PlaywrightLike) {
  return playwright.request.newContext({ baseURL: 'http://localhost:3000' })
}
