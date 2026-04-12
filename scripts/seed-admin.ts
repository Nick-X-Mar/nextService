/**
 * Seed script to create the initial admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *
 * Environment variables (optional, defaults to local DynamoDB):
 *   DYNAMODB_ENDPOINT - local DynamoDB endpoint (default: http://localhost:8000)
 *   REGION            - AWS region (default: eu-central-1)
 *   ADMIN_EMAIL       - admin email (default: admin@nextservice.gr)
 *   ADMIN_PASSWORD    - admin password (default: admin123)
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  ResourceNotFoundException
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const ADMIN_USERS_TABLE = process.env.ADMIN_USERS_TABLE || 'AdminUsers'
const REGION = process.env.REGION || 'eu-central-1'
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'

const email = process.env.ADMIN_EMAIL || 'admin@nextservice.gr'
const password = process.env.ADMIN_PASSWORD || 'admin123'

async function ensureTable(baseClient: DynamoDBClient, isLocal: boolean) {
  try {
    await baseClient.send(new DescribeTableCommand({ TableName: ADMIN_USERS_TABLE }))
    return
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err
  }

  console.log(`Creating ${ADMIN_USERS_TABLE} table...`)

  try {
    await baseClient.send(new CreateTableCommand({
      TableName: ADMIN_USERS_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'adminId', AttributeType: 'S' },
        { AttributeName: 'email', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: 'adminId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'EmailIndex',
          KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
          ...(isLocal ? { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } } : {})
        }
      ],
      ...(isLocal
        ? { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } }
        : { BillingMode: 'PAY_PER_REQUEST' }
      )
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // Wait for ACTIVE
  for (let i = 0; i < 30; i++) {
    try {
      const desc = await baseClient.send(new DescribeTableCommand({ TableName: ADMIN_USERS_TABLE }))
      if (desc.Table?.TableStatus === 'ACTIVE') {
        console.log(`${ADMIN_USERS_TABLE} table is ready.`)
        return
      }
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function main() {
  const isLocal = !!process.env.DYNAMODB_ENDPOINT

  const baseClient = new DynamoDBClient(
    isLocal
      ? { region: 'localhost', endpoint: ENDPOINT, credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' } }
      : { region: REGION }
  )
  const db = DynamoDBDocumentClient.from(baseClient)

  await ensureTable(baseClient, isLocal)

  // Check if admin already exists
  const existing = await db.send(new ScanCommand({
    TableName: ADMIN_USERS_TABLE,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email }
  }))

  if (existing.Items && existing.Items.length > 0) {
    console.log(`Admin user with email ${email} already exists (id: ${existing.Items[0].adminId})`)
    return
  }

  const adminId = `admin-${randomUUID()}`
  const passwordHash = await bcrypt.hash(password, 12)

  await db.send(new PutCommand({
    TableName: ADMIN_USERS_TABLE,
    Item: {
      adminId,
      email,
      passwordHash,
      displayName: 'Admin',
      role: 'super_admin',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    }
  }))

  console.log(`Admin user created successfully:`)
  console.log(`  ID:    ${adminId}`)
  console.log(`  Email: ${email}`)
  console.log(`  Role:  super_admin`)
  console.log(`\nYou can now login at /admin/login`)
}

main().catch(console.error)
