/**
 * Runtime creation, for DynamoDB Local only, of the two tables behind the
 * garages' Πληρωμές tab and the "δεν μπορώ να το αναλάβω" button. In AWS both
 * belong to the NextService-DynamoDB stack and this only finds them there.
 *
 * - RequestDeclines: one row per garage per request it declined, keyed
 *   `<requestId>#<garageId>` so a second one cannot exist.
 * - GarageSettlements: what a garage says it paid NextService towards its
 *   commission, and whether an admin has confirmed it.
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

  rawClient = new DynamoDBClient(config)
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

const declinesSpec: CreateTableCommandInput = {
  TableName: TABLES.RequestDeclines,
  AttributeDefinitions: [
    { AttributeName: 'declineId', AttributeType: 'S' },
    { AttributeName: 'garageId', AttributeType: 'S' },
    { AttributeName: 'requestId', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'declineId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    gsi('GarageDeclinesIndex', 'garageId', 'createdAt'),
    gsi('RequestDeclinesIndex', 'requestId', 'createdAt')
  ]
}

const settlementsSpec: CreateTableCommandInput = {
  TableName: TABLES.GarageSettlements,
  AttributeDefinitions: [
    { AttributeName: 'settlementId', AttributeType: 'S' },
    { AttributeName: 'garageId', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'settlementId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    gsi('GarageSettlementsIndex', 'garageId', 'createdAt'),
    gsi('StatusIndex', 'status', 'createdAt')
  ]
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
    console.error(`[ensureLedgerTables] ${name} failed:`, err)
  }
}

let declinesReady: Promise<void> | null = null
let settlementsReady: Promise<void> | null = null

export function ensureRequestDeclinesTable(): Promise<void> {
  if (!declinesReady) declinesReady = ensureTable(declinesSpec)
  return declinesReady
}

export function ensureGarageSettlementsTable(): Promise<void> {
  if (!settlementsReady) settlementsReady = ensureTable(settlementsSpec)
  return settlementsReady
}
