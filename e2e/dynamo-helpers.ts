import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Direct access to local DynamoDB, for fixtures the API deliberately will not
 * create.
 *
 * The completion flow only opens once an appointment's slot has passed, and
 * the booking API — correctly — refuses to schedule one in the past. Rather
 * than adding a backdoor to production code so a test can reach that state,
 * the test books a real appointment and then ages it here.
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
  const res = await client.send(new GetCommand({ TableName: 'ServiceRequests', Key: { id } }))
  return res.Item
}

/** Moves an appointment into the past so the completion prompt becomes due. */
export async function ageAppointment(requestId: string, daysAgo = 2): Promise<string> {
  const when = new Date(Date.now() - daysAgo * 86_400_000)
  const date = when.toISOString().slice(0, 10)
  await client.send(
    new UpdateCommand({
      TableName: 'ServiceRequests',
      Key: { id: requestId },
      UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
      ExpressionAttributeValues: { ':date': date, ':time': '09:00' },
    })
  )

  // The accepted offer carries a denormalised copy of the same appointment;
  // leave it disagreeing and the fixture stops resembling any real state.
  const offers = await client.send(
    new QueryCommand({
      TableName: 'Offers',
      IndexName: 'ServiceRequestOffersIndex',
      KeyConditionExpression: 'serviceRequestId = :id',
      ExpressionAttributeValues: { ':id': requestId },
    })
  )
  for (const offer of offers.Items ?? []) {
    if (offer.status !== 'accepted') continue
    await client.send(
      new UpdateCommand({
        TableName: 'Offers',
        Key: { id: offer.id },
        UpdateExpression: 'SET appointmentDate = :date, appointmentTime = :time',
        ExpressionAttributeValues: { ':date': date, ':time': '09:00' },
      })
    )
  }
  return date
}

export async function getGarage(id: string): Promise<Record<string, unknown> | undefined> {
  const res = await client.send(new GetCommand({ TableName: 'Garages', Key: { id } }))
  return res.Item
}
