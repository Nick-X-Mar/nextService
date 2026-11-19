/**
 * Runtime creation, for DynamoDB Local only, of the table of browsers and
 * installed apps that get push notifications (src/utils/pushService.ts). In
 * AWS it belongs to the NextService-DynamoDB stack and this only finds it there.
 *
 * - PushSubscriptions: one row per push subscription, keyed by a hash of its
 *   endpoint, so a device that signs in as someone else is re-owned by the
 *   same write. UserSubscriptionsIndex lists one account's devices.
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  type CreateTableCommandInput
} from '@aws-sdk/client-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import { TABLES } from '@/lib/tables'
import { retryAfterFreeze } from '@/utils/awsFreezeRetry'

const isLocal =
  process.env.NODE_ENV === 'development' && !!process.env.DYNAMODB_ENDPOINT

let rawClient: DynamoDBClient | null = null
function getRawClient(): DynamoDBClient {
  if (rawClient) return rawClient

  if (isLocal) {
    rawClient = new DynamoDBClient({
      region: 'localhost',
      endpoint: process.env.DYNAMODB_ENDPOINT,
      credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' }
    })
    return rawClient
  }

  const config: ConstructorParameters<typeof DynamoDBClient>[0] = {
    region: process.env.REGION || 'eu-central-1'
  }

  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
  } else if (!['production', 'staging'].includes(process.env.NODE_ENV || '')) {
    try {
      config.credentials = fromIni({
        filepath: path.join(process.cwd(), '.aws', 'credentials'),
        configFilepath: path.join(process.cwd(), '.aws', 'config'),
        profile: 'default'
      })
    } catch { /* fall through */ }
  }

  rawClient = retryAfterFreeze(new DynamoDBClient(config))
  return rawClient
}

const gsi = (name: string, hash: string, range: string) => ({
  IndexName: name,
  KeySchema: [
    { AttributeName: hash, KeyType: 'HASH' as const },
    { AttributeName: range, KeyType: 'RANGE' as const }
  ],
  Projection: { ProjectionType: 'ALL' as const }
})

const subscriptionsSpec: CreateTableCommandInput = {
  TableName: TABLES.PushSubscriptions,
  AttributeDefinitions: [
    { AttributeName: 'subscriptionId', AttributeType: 'S' },
    { AttributeName: 'userKey', AttributeType: 'S' },
    { AttributeName: 'updatedAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'subscriptionId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [gsi('UserSubscriptionsIndex', 'userKey', 'updatedAt')]
}

function applyBilling(s: CreateTableCommandInput): CreateTableCommandInput {
  if (isLocal) {
    // DynamoDB Local requires explicit throughput on the table and on every
    // index; PAY_PER_REQUEST is rejected outright.
    return {
      ...s,
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      GlobalSecondaryIndexes: s.GlobalSecondaryIndexes?.map((gsi) => ({
        ...gsi,
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }))
    }
  }
  return { ...s, BillingMode: 'PAY_PER_REQUEST' }
}

async function waitForActive(client: DynamoDBClient, name: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const desc = await client.send(new DescribeTableCommand({ TableName: name }))
      if (desc.Table?.TableStatus === 'ACTIVE') return
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function ensureTable(spec: CreateTableCommandInput): Promise<void> {
  const client = getRawClient()
  const name = spec.TableName!

  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: name }))
    if (desc.Table?.TableStatus === 'ACTIVE') return
    await waitForActive(client, name)
    return
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) return
  }

  try {
    await client.send(new CreateTableCommand(applyBilling(spec)))
    await waitForActive(client, name)
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      await waitForActive(client, name)
      return
    }
    console.error(`[ensurePushSubscriptionsTable] ${name} failed:`, err)
  }
}

let ready: Promise<void> | null = null

export function ensurePushSubscriptionsTable(): Promise<void> {
  if (!ready) ready = ensureTable(subscriptionsSpec)
  return ready
}
