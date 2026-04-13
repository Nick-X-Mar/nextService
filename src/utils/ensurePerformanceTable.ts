/**
 * Lazily creates the PerformanceMetrics DynamoDB table on first use.
 * Follows the same pattern as ensurePaymentTables.ts.
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

export const PERFORMANCE_TABLE = process.env.PERFORMANCE_TABLE || 'PerformanceMetrics'

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
    } catch {
      // fall through to default credential chain
    }
  }

  rawClient = new DynamoDBClient(config)
  return rawClient
}

// Partition key: endpoint (e.g. "/api/offers")
// Sort key: timestamp (ISO string) — enables range queries for time windows
// GSI on statusCode+timestamp for error rate queries
const tableSpec: CreateTableCommandInput = {
  TableName: PERFORMANCE_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'endpoint', AttributeType: 'S' },
    { AttributeName: 'timestamp', AttributeType: 'S' },
    { AttributeName: 'statusCode', AttributeType: 'N' },
  ],
  KeySchema: [
    { AttributeName: 'endpoint', KeyType: 'HASH' },
    { AttributeName: 'timestamp', KeyType: 'RANGE' },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'StatusCodeIndex',
      KeySchema: [
        { AttributeName: 'statusCode', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
}

function applyBilling(spec: CreateTableCommandInput): CreateTableCommandInput {
  if (isLocal) {
    return {
      ...spec,
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      GlobalSecondaryIndexes: spec.GlobalSecondaryIndexes?.map((gsi) => ({
        ...gsi,
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }))
    }
  }
  return { ...spec, BillingMode: 'PAY_PER_REQUEST' }
}

async function waitForActive(client: DynamoDBClient, name: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const desc = await client.send(new DescribeTableCommand({ TableName: name }))
      if (desc.Table?.TableStatus === 'ACTIVE') return
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

let ready: Promise<void> | null = null

export function ensurePerformanceTable(): Promise<void> {
  if (!ready) ready = doEnsure()
  return ready
}

async function doEnsure(): Promise<void> {
  const client = getRawClient()
  const name = PERFORMANCE_TABLE

  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: name }))
    if (desc.Table?.TableStatus === 'ACTIVE') return
    await waitForActive(client, name)
    return
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      console.error(`[ensurePerformanceTable] Failed to describe ${name}:`, err)
      return
    }
  }

  try {
    await client.send(new CreateTableCommand(applyBilling(tableSpec)))
    console.log(`[ensurePerformanceTable] Created ${name}`)
    await waitForActive(client, name)
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      await waitForActive(client, name)
      return
    }
    console.error(`[ensurePerformanceTable] Failed to create ${name}:`, err)
  }
}
