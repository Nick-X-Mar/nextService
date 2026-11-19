/**
 * Give every PerformanceMetrics row the `expiresAt` the retention allows: 30
 * days after it was recorded, the period the privacy policy promises for
 * technical logs and the one recordMetric() stamps on new rows. That covers
 * rows written before the table had TTL and rows stamped under a longer
 * retention; a later `expiresAt` is brought forward, an earlier one is never
 * pushed back. A row already older than that gets an `expiresAt` in the past,
 * which DynamoDB deletes within a day or two.
 *
 * Dry run by default; pass --apply to write. Only `expiresAt` is changed, each
 * update conditional on it still being missing or later than the target.
 *
 * Usage (local DynamoDB):
 *   DYNAMODB_ENDPOINT=http://localhost:8000 npx tsx scripts/backfill-metric-ttl.ts [--apply]
 *
 * Usage (AWS DynamoDB — credentials from the project-local .aws/ folder;
 * staging by default, REGION=eu-south-1 for production):
 *   npx tsx scripts/backfill-metric-ttl.ts [--apply]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import { TABLES } from '../src/lib/tables'

const TABLE = TABLES.PerformanceMetrics
const REGION = process.env.REGION || 'eu-central-1'
const ENDPOINT = process.env.DYNAMODB_ENDPOINT
const APPLY = process.argv.includes('--apply')

// Same as METRIC_TTL_SECONDS in src/utils/performanceService.ts.
const TTL_SECONDS = 30 * 24 * 60 * 60
const CONCURRENCY = 25

const isLocal = !!ENDPOINT && ENDPOINT.includes('localhost')

// Same credential resolution as scripts/fix-hot-deal-categories.ts.
const awsConfig: ConstructorParameters<typeof DynamoDBClient>[0] = isLocal
  ? {
      region: 'localhost',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
    }
  : {
      region: REGION,
      credentials:
        process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.ACCESS_KEY_ID,
              secretAccessKey: process.env.SECRET_ACCESS_KEY,
            }
          : fromIni({
              filepath: path.join(process.cwd(), '.aws', 'credentials'),
              configFilepath: path.join(process.cwd(), '.aws', 'config'),
              profile: 'default',
            }),
    }

const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig))

interface MetricRow {
  endpoint: string
  timestamp: string
  rawTimestamp?: string
  expiresAt?: number
}

async function scanAll(): Promise<MetricRow[]> {
  const rows: MetricRow[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const res = await db.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'endpoint, #ts, rawTimestamp, expiresAt',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExclusiveStartKey: startKey,
    }))
    rows.push(...((res.Items || []) as MetricRow[]))
    startKey = res.LastEvaluatedKey
  } while (startKey)
  return rows
}

/** When the call was recorded: rawTimestamp, else the sort key before its `#suffix`. */
function recordedAt(row: MetricRow): number | null {
  for (const value of [row.rawTimestamp, row.timestamp.split('#')[0]]) {
    const ms = value ? Date.parse(value) : NaN
    if (!Number.isNaN(ms)) return ms
  }
  return null
}

async function main() {
  console.log(`${TABLE} @ ${isLocal ? ENDPOINT : REGION} — ${APPLY ? 'APPLY' : 'dry run'}`)
  const rows = await scanAll()
  const now = Math.floor(Date.now() / 1000)

  const updates: { row: MetricRow; expiresAt: number }[] = []
  const undated: MetricRow[] = []
  for (const row of rows) {
    const ms = recordedAt(row)
    if (ms === null) {
      if (row.expiresAt === undefined) undated.push(row)
      continue
    }
    const expiresAt = Math.floor(ms / 1000) + TTL_SECONDS
    if (row.expiresAt === undefined || row.expiresAt > expiresAt) updates.push({ row, expiresAt })
  }

  const expired = updates.filter((u) => u.expiresAt <= now).length
  const days = updates.map((u) => u.expiresAt - TTL_SECONDS).sort((a, b) => a - b)
  console.log(`Rows: ${rows.length}, to (re)stamp: ${updates.length}`)
  console.log(`  without expiresAt: ${updates.filter((u) => u.row.expiresAt === undefined).length}`)
  console.log(`  expiring later than ${TTL_SECONDS / 86400} days: ${updates.filter((u) => u.row.expiresAt !== undefined).length}`)
  if (days.length) {
    const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10)
    console.log(`  recorded ${day(days[0])} → ${day(days[days.length - 1])}`)
  }
  console.log(`  already past ${TTL_SECONDS / 86400} days (TTL deletes them within ~48h): ${expired}`)
  console.log(`  no usable date and no expiresAt, left alone: ${undated.length}`)

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.')
    return
  }

  let done = 0
  let skipped = 0
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    await Promise.all(updates.slice(i, i + CONCURRENCY).map(async ({ row, expiresAt }) => {
      try {
        await db.send(new UpdateCommand({
          TableName: TABLE,
          Key: { endpoint: row.endpoint, timestamp: row.timestamp },
          UpdateExpression: 'SET expiresAt = :e',
          ConditionExpression: 'attribute_exists(endpoint) AND (attribute_not_exists(expiresAt) OR expiresAt > :e)',
          ExpressionAttributeValues: { ':e': expiresAt },
        }))
        done++
      } catch (err) {
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err
        skipped++
      }
    }))
    if ((i / CONCURRENCY) % 40 === 0) console.log(`  ${done + skipped}/${updates.length}`)
  }
  console.log(`\nStamped ${done} rows (${skipped} changed meanwhile, left alone).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
