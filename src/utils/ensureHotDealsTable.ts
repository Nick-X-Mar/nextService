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

const HOT_DEALS_TABLE = process.env.HOT_DEALS_TABLE || 'HotDeals'

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

const spec: CreateTableCommandInput = {
  TableName: HOT_DEALS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'dealId', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'dealId', KeyType: 'HASH' }]
}

function applyBilling(s: CreateTableCommandInput): CreateTableCommandInput {
  if (isLocal) {
    return { ...s, ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } }
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

let ready: Promise<void> | null = null

export function ensureHotDealsTable(): Promise<void> {
  if (!ready) ready = (async () => {
    const client = getRawClient()
    const name = HOT_DEALS_TABLE

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
      console.error(`[ensureHotDealsTable] Failed:`, err)
    }
  })()
  return ready
}

export const HOT_DEALS_TABLE_NAME = HOT_DEALS_TABLE
