/**
 * Lazily creates the EventLogs and EmailLogs DynamoDB tables on first use
 * if they don't already exist. Runs once per Node process — the returned
 * promises are cached at module level.
 *
 * Works identically against local DynamoDB and real AWS: both paths go
 * through the SDK, there's no manual script to run.
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  UpdateTimeToLiveCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  type CreateTableCommandInput
} from '@aws-sdk/client-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

const EVENT_LOGS_TABLE = process.env.EVENT_LOGS_TABLE || 'EventLogs'
const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'EmailLogs'

// Local DynamoDB doesn't accept PAY_PER_REQUEST on all versions, so we
// emit provisioned throughput there and PAY_PER_REQUEST on real AWS.
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

const eventLogsSpec: CreateTableCommandInput = {
  TableName: EVENT_LOGS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'eventId', AttributeType: 'S' },
    { AttributeName: 'clientId', AttributeType: 'S' },
    { AttributeName: 'garageId', AttributeType: 'S' },
    { AttributeName: 'requestId', AttributeType: 'S' },
    { AttributeName: 'eventName', AttributeType: 'S' },
    { AttributeName: 'timestamp', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'ClientTimelineIndex',
      KeySchema: [
        { AttributeName: 'clientId', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'GarageTimelineIndex',
      KeySchema: [
        { AttributeName: 'garageId', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'RequestTimelineIndex',
      KeySchema: [
        { AttributeName: 'requestId', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'EventNameIndex',
      KeySchema: [
        { AttributeName: 'eventName', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
}

const emailLogsSpec: CreateTableCommandInput = {
  TableName: EMAIL_LOGS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'emailId', AttributeType: 'S' },
    { AttributeName: 'to', AttributeType: 'S' },
    { AttributeName: 'templateName', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'sentAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'emailId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'RecipientIndex',
      KeySchema: [
        { AttributeName: 'to', KeyType: 'HASH' },
        { AttributeName: 'sentAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'TemplateIndex',
      KeySchema: [
        { AttributeName: 'templateName', KeyType: 'HASH' },
        { AttributeName: 'sentAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'StatusIndex',
      KeySchema: [
        { AttributeName: 'status', KeyType: 'HASH' },
        { AttributeName: 'sentAt', KeyType: 'RANGE' }
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

async function ensureTtl(client: DynamoDBClient, name: string): Promise<void> {
  try {
    const desc = await client.send(new DescribeTimeToLiveCommand({ TableName: name }))
    const status = desc.TimeToLiveDescription?.TimeToLiveStatus
    const attr = desc.TimeToLiveDescription?.AttributeName
    if ((status === 'ENABLED' || status === 'ENABLING') && attr === 'expiresAt') {
      return
    }
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: name,
        TimeToLiveSpecification: { Enabled: true, AttributeName: 'expiresAt' }
      })
    )
    console.log(`[ensureEventTables] Enabled TTL on ${name} (attribute=expiresAt)`)
  } catch (err) {
    // Local DynamoDB sometimes doesn't support TTL describe — non-fatal.
    console.warn(`[ensureEventTables] TTL setup skipped/failed on ${name}:`, err instanceof Error ? err.message : err)
  }
}

async function ensureTable(spec: CreateTableCommandInput): Promise<void> {
  const client = getRawClient()
  const name = spec.TableName!

  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: name }))
    if (desc.Table?.TableStatus === 'ACTIVE') {
      await ensureTtl(client, name)
      return
    }
    await waitForActive(client, name)
    await ensureTtl(client, name)
    return
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      console.error(`[ensureEventTables] Failed to describe ${name}:`, err)
      return
    }
  }

  try {
    await client.send(new CreateTableCommand(applyBilling(spec)))
    console.log(`[ensureEventTables] Created ${name}`)
    await waitForActive(client, name)
    await ensureTtl(client, name)
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      // Another request won the race — just wait for it.
      await waitForActive(client, name)
      await ensureTtl(client, name)
      return
    }
    console.error(`[ensureEventTables] Failed to create ${name}:`, err)
  }
}

// Cache the promises at module level so the check runs once per process.
// Never rejects — errors are logged inside ensureTable and swallowed so the
// caller's fire-and-forget pattern is preserved.
let eventLogsReady: Promise<void> | null = null
let emailLogsReady: Promise<void> | null = null

export function ensureEventLogsTable(): Promise<void> {
  if (!eventLogsReady) eventLogsReady = ensureTable(eventLogsSpec)
  return eventLogsReady
}

export function ensureEmailLogsTable(): Promise<void> {
  if (!emailLogsReady) emailLogsReady = ensureTable(emailLogsSpec)
  return emailLogsReady
}
