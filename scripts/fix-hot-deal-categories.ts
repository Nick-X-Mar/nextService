/**
 * Re-file hot deals saved under the old two-value categories.
 *
 * Until the admin editor offered the request form's own categories, every deal
 * was either `service` or `fanopeia`. "Πάρε Προσφορά" hands a deal's category
 * to the request form as-is, so a clutch deal filed as `service` opened the
 * form as "Συντήρηση", and the price lookup — keyed on `symplektis` — never
 * matched it.
 *
 * The categories in `src/data/offers.json` are the corrected ones, so a deal
 * whose slug is listed there is moved to that category — but only while it
 * still holds one of the two legacy values, so a category an admin has since
 * chosen by hand is never overwritten. Deals that aren't in offers.json and
 * still hold a legacy value are listed for a manual choice in /admin/hot-deals.
 *
 * Dry run by default; pass --apply to write. Only the `category` attribute is
 * changed, each update conditional on the value it was read with.
 *
 * Usage (local DynamoDB):
 *   DYNAMODB_ENDPOINT=http://localhost:8000 npx tsx scripts/fix-hot-deal-categories.ts [--apply]
 *
 * Usage (AWS DynamoDB — credentials from the project-local .aws/ folder):
 *   npx tsx scripts/fix-hot-deal-categories.ts [--apply]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import staticOffers from '../src/data/offers.json'
import { REQUEST_CATEGORIES } from '../src/utils/categoryLabels'

const TABLE = process.env.HOT_DEALS_TABLE || 'HotDeals'
const REGION = process.env.REGION || 'eu-central-1'
const ENDPOINT = process.env.DYNAMODB_ENDPOINT
const APPLY = process.argv.includes('--apply')

const LEGACY = new Set(['service', 'fanopeia'])

const isLocal = !!ENDPOINT && ENDPOINT.includes('localhost')

// Same credential resolution as scripts/seed-hot-deals.ts.
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

interface DealRow {
  dealId: string
  slug?: string
  title?: string
  category?: string
}

async function scanAll(): Promise<DealRow[]> {
  const rows: DealRow[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const res = await db.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'dealId, slug, title, category',
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
    }))
    rows.push(...((res.Items ?? []) as DealRow[]))
    startKey = res.LastEvaluatedKey
  } while (startKey)
  return rows
}

async function main() {
  console.log(`\n→ ${isLocal ? 'LOCAL' : `AWS (${REGION})`} DynamoDB, table ${TABLE}${APPLY ? '' : ' — dry run, pass --apply to write'}`)

  const target = new Map<string, string>()
  for (const offer of staticOffers as { slug: string; category: string }[]) {
    if (!REQUEST_CATEGORIES.includes(offer.category)) {
      throw new Error(`offers.json: "${offer.slug}" has category "${offer.category}", which the request form doesn't know`)
    }
    target.set(offer.slug, offer.category)
  }

  const rows = await scanAll()
  let changed = 0
  const manual: DealRow[] = []

  for (const row of rows) {
    const current = row.category ?? ''
    const wanted = row.slug ? target.get(row.slug) : undefined

    if (!LEGACY.has(current) || current === wanted) {
      console.log(`  ✓ ${row.slug ?? row.dealId} — ${current || '(none)'}`)
      continue
    }
    if (!wanted) {
      manual.push(row)
      continue
    }

    console.log(`  ${APPLY ? '↻' : '→'} ${row.slug} — ${current} → ${wanted}`)
    if (APPLY) {
      await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { dealId: row.dealId },
        UpdateExpression: 'SET category = :wanted',
        ConditionExpression: 'category = :current',
        ExpressionAttributeValues: { ':wanted': wanted, ':current': current },
      }))
    }
    changed++
  }

  for (const row of manual) {
    console.log(`  ? ${row.slug ?? row.dealId} ("${row.title ?? ''}") — still "${row.category}"; choose its category in /admin/hot-deals`)
  }
  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${changed} of ${rows.length} deals; ${manual.length} need a manual choice.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
