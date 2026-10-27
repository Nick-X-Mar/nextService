import { type APIRequestContext } from '@playwright/test'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Fixtures for the garage offer specs.
 *
 * The DynamoDB access is local-only (DynamoDB Local, dummy credentials) and
 * only ever touches rows the calling test created — for states the API
 * reaches through flows these specs are not about (a request a client
 * cancelled, an acceptance when payments need a Stripe intent).
 */
const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

export async function getOffer(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await db.send(new GetCommand({ TableName: 'Offers', Key: { id }, ConsistentRead: true }))
  return res.Item
}

export async function setRequestStatus(id: string, status: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    })
  )
}

/** 'YYYY-MM-DD', `days` from today (UTC is close enough this far out). */
export function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

/** The next `count` weekdays starting `fromDays` out — what the offer calendar allows. */
export function futureWeekdays(count: number, fromDays = 3): string[] {
  const out: string[] = []
  for (let d = fromDays; out.length < count; d++) {
    const date = new Date(Date.now() + d * 86_400_000)
    const day = date.getUTCDay()
    if (day !== 0 && day !== 6) out.push(date.toISOString().slice(0, 10))
  }
  return out
}

export async function createRequest(
  request: APIRequestContext,
  clientToken: string,
  clientId: string,
  description: string
): Promise<string> {
  const resp = await request.post('/api/service-request', {
    headers: { Cookie: `auth-token=${clientToken}` },
    data: {
      clientId,
      category: 'symplektis',
      description,
      brand: 'Fiat',
      model: 'Punto',
      modelYear: '2016',
      engineCC: '1200',
      fuelType: 'petrol',
      isAutomatic: false,
      is4x4: false,
    },
  })
  const data = await resp.json()
  if (!data.serviceRequestId) throw new Error(`service request failed: ${resp.status()} ${JSON.stringify(data)}`)
  return data.serviceRequestId
}

/**
 * Books the offer the way a client does. When payments are switched on the
 * booking needs a Stripe intent this suite cannot mint, so the same end state
 * is written directly instead — the specs using this test what happens to an
 * accepted offer, not how it got accepted.
 */
export async function acceptOffer(
  request: APIRequestContext,
  args: { clientToken: string; requestId: string; offerId: string; date: string; time: string; price: number }
): Promise<void> {
  const resp = await request.patch(`/api/requests/${args.requestId}/accept-offer/`, {
    headers: { Cookie: `auth-token=${args.clientToken}` },
    data: { offerId: args.offerId, appointmentDate: args.date, appointmentTime: args.time, appointmentPrice: args.price },
  })
  if (resp.ok()) return
  const body = await resp.text()
  if (!/payment/i.test(body)) throw new Error(`accept-offer failed: ${resp.status()} ${body}`)

  await db.send(
    new UpdateCommand({
      TableName: 'Offers',
      Key: { id: args.offerId },
      UpdateExpression: 'SET #status = :status, appointmentDate = :date, appointmentTime = :time, appointmentPrice = :price',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'accepted', ':date': args.date, ':time': args.time, ':price': args.price },
    })
  )
  await db.send(
    new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: args.requestId },
      UpdateExpression: 'SET #status = :status, acceptedOfferId = :offerId, appointmentDate = :date, appointmentTime = :time',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'appointment', ':offerId': args.offerId, ':date': args.date, ':time': args.time },
    })
  )
}

/**
 * A freshly registered garage — pending admin approval, but signed in, which
 * is exactly the state a new garage is in after the registration form.
 */
export async function registerPendingGarage(request: APIRequestContext) {
  const stamp = Date.now()
  const tin = String(stamp).slice(-9)
  const email = `e2e-pending-garage-${stamp}@test.com`
  const resp = await request.post('/api/auth/register-professional', {
    data: {
      companyName: `E2E Pending ${stamp}`,
      contactFirstName: 'Πέτρος',
      contactLastName: 'Δοκιμής',
      tin,
      email,
      password: 'TestPass123',
      taxAuthority: 'ΔΟΥ Αθηνών',
      address: 'Πατησίων 1, Αθήνα',
      mobile: `69${String(stamp).slice(-8)}`,
      acceptedTerms: true,
    },
  })
  const data = await resp.json()
  const match = (resp.headers()['set-cookie'] || '').match(/auth-token=([^;]+)/)
  if (!resp.ok() || !match) throw new Error(`garage registration failed: ${resp.status()} ${JSON.stringify(data)}`)
  return { id: data.garage.id as string, email, token: match[1] }
}
