/**
 * Runtime creation for the SiteContent table.
 *
 * One item per editable page, keyed by `pageKey` — `about`, `faq`, `terms`,
 * … and `area:<slug>` for the per-area copy behind /location/[slug]. Small,
 * read-mostly, and always read through a cache, so a plain partition key with
 * no indexes is all it needs.
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

const SITE_CONTENT_TABLE = process.env.SITE_CONTENT_TABLE || 'SiteContent'

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
  TableName: SITE_CONTENT_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'pageKey', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'pageKey', KeyType: 'HASH' }]
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

export function ensureSiteContentTable(): Promise<void> {
  if (!ready) ready = (async () => {
    const client = getRawClient()
    const name = SITE_CONTENT_TABLE

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
      console.error(`[ensureSiteContentTable] Failed:`, err)
    }
  })()
  return ready
}

export const SITE_CONTENT_TABLE_NAME = SITE_CONTENT_TABLE
