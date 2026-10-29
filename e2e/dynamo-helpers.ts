import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { athensDatePlus } from './d-helpers'
import { TABLES } from '../src/lib/tables'

/**
 * Direct access to local DynamoDB, for fixtures the API deliberately will not
 * create.
 *
 * The completion flow only opens once an appointment's slot has passed, and
 * accept-offer refuses to book a date before Athens' today or an hour that has
 * already gone. Rather than adding a backdoor to production code so a test can
 * reach that state, the test books a real future appointment and then ages it
 * here.
 *
 * Local only: it points at DynamoDB Local with dummy credentials.
 */
const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  })
)

export async function getServiceRequest(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await client.send(new GetCommand({ TableName: TABLES.ServiceRequests, Key: { id }, ConsistentRead: true }))
  return res.Item
}

export async function getOffer(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await client.send(new GetCommand({ TableName: TABLES.Offers, Key: { id }, ConsistentRead: true }))
  return res.Item
}

/**
 * Moves an appointment into the past so the completion prompt becomes due.
 * Returns the new date — an Athens calendar date, as the app stores them.
 */
export async function ageAppointment(requestId: string, daysAgo = 2): Promise<string> {
  const date = athensDatePlus(-daysAgo)
  await client.send(
    new UpdateCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
      ExpressionAttributeValues: { ':date': date, ':time': '09:00' },
    })
  )

  // The accepted offer carries a denormalised copy of the same appointment;
  // leave it disagreeing and the fixture stops resembling any real state.
  const offers = await client.send(
    new QueryCommand({
      TableName: TABLES.Offers,
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :id',
      ExpressionAttributeValues: { ':id': requestId },
    })
  )
  for (const offer of offers.Items ?? []) {
    if (offer.status !== 'accepted') continue
    await client.send(
      new UpdateCommand({
        TableName: TABLES.Offers,
        Key: { id: offer.id },
        UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
        ExpressionAttributeValues: { ':date': date, ':time': '09:00' },
      })
    )
  }
  return date
}

/**
 * A pending offer from a second garage on the same request.
 *
 * The suite has a single test garage, and racing two acceptances needs two
 * competing offers. The garage never logs in, but it gets an active Garages
 * row: acceptance checks the garage is still active in the same transaction,
 * so an offer from a garage that does not exist could never be booked.
 */
export async function insertCompetingOffer(
  requestId: string,
  offerAmount: number,
  availabilityDates: string[]
): Promise<string> {
  const id = `offer_e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const garageId = `e2e-garage-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const now = new Date().toISOString()
  await client.send(
    new PutCommand({
      TableName: TABLES.Garages,
      Item: {
        id: garageId,
        email: `${garageId}@test.com`,
        companyName: 'E2E Ανταγωνιστής',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(id)',
    })
  )
  await client.send(
    new PutCommand({
      TableName: TABLES.Offers,
      Item: {
        id,
        offerNumber: `E2E_${id}`,
        serviceRequestId: requestId,
        garageId,
        estimatedCost: 0,
        offerAmount,
        status: 'pending',
        benefits: [],
        availabilityDates,
        availabilitySlots: {},
        clientAvailabilityDates: [],
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(id)',
    })
  )
  return id
}

/**
 * Turns a job closed through the API back into what one closed before the
 * completion flow looks like: COMPLETED with no outcome and no declared
 * amount, which is exactly the row the commission fallback exists for.
 */
/** A job closed before rates were frozen on it: billed at the garage's rate today. */
export async function unfreezeCommissionRate(requestId: string): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      UpdateExpression: 'REMOVE commissionPercent',
    })
  )
}

export async function makeLegacyCompletion(requestId: string): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      UpdateExpression: 'REMOVE finalAmounts, completionOutcome',
    })
  )
}

export async function getGarage(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await client.send(new GetCommand({ TableName: TABLES.Garages, Key: { id } }))
  return res.Item
}

/**
 * A closed job with no usable amount at all — no declaration and a zero
 * quote. It bills nothing, and both commission pages must leave it out.
 */
export async function makeUnpricedCompletion(requestId: string): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: TABLES.ServiceRequests,
      Key: { id: requestId },
      UpdateExpression: 'SET appointmentPrice = :zero REMOVE finalAmounts, completionOutcome',
      ExpressionAttributeValues: { ':zero': 0 },
    })
  )
}

/** Deletes a row a test itself created — the stand-in for a write that fails half-way. */
export async function deleteOffer(id: string): Promise<void> {
  await client.send(new DeleteCommand({ TableName: TABLES.Offers, Key: { id } }))
}

/** Puts back a row `deleteOffer` removed. */
export async function putOffer(item: Record<string, unknown>): Promise<void> {
  await client.send(new PutCommand({ TableName: TABLES.Offers, Item: item }))
}
