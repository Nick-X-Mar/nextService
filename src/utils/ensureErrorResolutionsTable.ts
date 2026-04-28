/**
 * Lazily creates the ErrorResolutions DynamoDB table on first use if it
 * doesn't already exist. Mirrors ensureEventTables for local dev — the
 * real table is provisioned via CDK in production.
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

export const ERROR_RESOLUTIONS_TABLE =
  process.env.ERROR_RESOLUTIONS_TABLE || 'ErrorResolutions'

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

const errorResolutionsSpec: CreateTableCommandInput = {
  TableName: ERROR_RESOLUTIONS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'fingerprint', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'resolvedAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'fingerprint', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'StatusIndex',
      KeySchema: [
        { AttributeName: 'status', KeyType: 'HASH' },
        { AttributeName: 'resolvedAt', KeyType: 'RANGE' }
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

async function ensureTable(spec: CreateTableCommandInput): Promise<void> {
  const client = getRawClient()
  const name = spec.TableName!

  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: name }))
    if (desc.Table?.TableStatus === 'ACTIVE') return
    await waitForActive(client, name)
    return
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      console.error(`[ensureErrorResolutionsTable] Failed to describe ${name}:`, err)
      return
    }
  }

  try {
    await client.send(new CreateTableCommand(applyBilling(spec)))
    console.log(`[ensureErrorResolutionsTable] Created ${name}`)
    await waitForActive(client, name)
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      await waitForActive(client, name)
      return
    }
    console.error(`[ensureErrorResolutionsTable] Failed to create ${name}:`, err)
  }
}

let ready: Promise<void> | null = null

export function ensureErrorResolutionsTable(): Promise<void> {
  if (!ready) ready = ensureTable(errorResolutionsSpec)
  return ready
}
