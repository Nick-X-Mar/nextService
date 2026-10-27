import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

/**
 * Fixtures for the realtime / auth hardening specs (agent R).
 *
 * States the app cannot be asked to produce on demand — a merge that died
 * halfway through, a review on a legacy guest, a link opened a day ago — are
 * written straight into local DynamoDB; everything after that goes through the
 * real API.
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

/** Sets (or, for `undefined`, removes) attributes on an existing row. */
export async function setFields(
  table: string,
  key: Record<string, string>,
  fields: Record<string, unknown>
): Promise<void> {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const sets: string[] = []
  const removes: string[] = []
  Object.entries(fields).forEach(([field, value], i) => {
    names[`#f${i}`] = field
    if (value === undefined) {
      removes.push(`#f${i}`)
    } else {
      values[`:v${i}`] = value
      sets.push(`#f${i} = :v${i}`)
    }
  })
  const keyName = Object.keys(key)[0]
  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: [sets.length ? `SET ${sets.join(', ')}` : '', removes.length ? `REMOVE ${removes.join(', ')}` : '']
        .filter(Boolean)
        .join(' '),
      ConditionExpression: `attribute_exists(#key)`,
      ExpressionAttributeNames: { ...names, '#key': keyName },
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
    })
  )
}

export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

/**
 * A review row shaped as reviewService writes one. The real path needs a
 * completed appointment on both sides; what the merge cares about is only
 * that the row names the guest.
 */
export async function putReview(review: {
  requestId: string
  clientId: string
  garageId: string
  direction: 'client_to_garage' | 'garage_to_client'
  rating: number
}): Promise<string> {
  const now = new Date().toISOString()
  const reviewId = `${review.requestId}#${review.direction}`
  await ddb.send(
    new PutCommand({
      TableName: 'Reviews',
      Item: { reviewId, ...review, status: 'published', revealAt: now, createdAt: now },
      ConditionExpression: 'attribute_not_exists(reviewId)',
    })
  )
  return reviewId
}

export async function getReview(reviewId: string): Promise<Record<string, unknown> | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: 'Reviews', Key: { reviewId }, ConsistentRead: true }))
  return res.Item
}

/** EmailLogs rows for one client and template (local emails are logged as `skipped`). */
export async function clientEmailLogs(clientId: string, templateName: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: 'EmailLogs',
        FilterExpression: 'clientId = :c AND templateName = :t',
        ExpressionAttributeValues: { ':c': clientId, ':t': templateName },
        ExclusiveStartKey,
      })
    )
    rows.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return rows
}

/** The canonical site origin the app publishes (robots.txt `Host:`, built from SITE_URL). */
export async function publishedSiteOrigin(): Promise<string> {
  const res = await fetch('http://localhost:3000/robots.txt')
  const host = (await res.text()).match(/^Host:\s*(\S+)/im)?.[1]
  if (!host) throw new Error('robots.txt carries no Host line')
  return new URL(host).origin
}
