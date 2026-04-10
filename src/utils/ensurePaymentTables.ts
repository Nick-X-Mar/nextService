/**
 * Lazily creates the Payments and WalletTransactions DynamoDB tables on first
 * use if they don't already exist. Follows the same pattern as ensureEventTables.ts.
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

const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'Payments'
const WALLET_TRANSACTIONS_TABLE = process.env.WALLET_TRANSACTIONS_TABLE || 'WalletTransactions'

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

const paymentsSpec: CreateTableCommandInput = {
  TableName: PAYMENTS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'paymentId', AttributeType: 'S' },
    { AttributeName: 'clientId', AttributeType: 'S' },
    { AttributeName: 'requestId', AttributeType: 'S' },
    { AttributeName: 'garageId', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'paymentId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'ClientPaymentsIndex',
      KeySchema: [
        { AttributeName: 'clientId', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'RequestPaymentIndex',
      KeySchema: [
        { AttributeName: 'requestId', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'GaragePaymentsIndex',
      KeySchema: [
        { AttributeName: 'garageId', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
}

const walletTransactionsSpec: CreateTableCommandInput = {
  TableName: WALLET_TRANSACTIONS_TABLE,
  AttributeDefinitions: [
    { AttributeName: 'transactionId', AttributeType: 'S' },
    { AttributeName: 'clientId', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' }
  ],
  KeySchema: [{ AttributeName: 'transactionId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'ClientWalletIndex',
      KeySchema: [
        { AttributeName: 'clientId', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
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
    console.log(`[ensurePaymentTables] Enabled TTL on ${name} (attribute=expiresAt)`)
  } catch (err) {
    console.warn(`[ensurePaymentTables] TTL setup skipped/failed on ${name}:`, err instanceof Error ? err.message : err)
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
      console.error(`[ensurePaymentTables] Failed to describe ${name}:`, err)
      return
    }
  }

  try {
    await client.send(new CreateTableCommand(applyBilling(spec)))
    console.log(`[ensurePaymentTables] Created ${name}`)
    await waitForActive(client, name)
    await ensureTtl(client, name)
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      await waitForActive(client, name)
      await ensureTtl(client, name)
      return
    }
    console.error(`[ensurePaymentTables] Failed to create ${name}:`, err)
  }
}

let paymentsReady: Promise<void> | null = null
let walletReady: Promise<void> | null = null

export function ensurePaymentsTable(): Promise<void> {
  if (!paymentsReady) paymentsReady = ensureTable(paymentsSpec)
  return paymentsReady
}

export function ensureWalletTransactionsTable(): Promise<void> {
  if (!walletReady) walletReady = ensureTable(walletTransactionsSpec)
  return walletReady
}
