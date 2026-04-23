/**
 * Seed the HotDeals table with the 5 starter offers using the original
 * English slugs that Google indexed.
 *
 * Usage (local DynamoDB):
 *   DYNAMODB_ENDPOINT=http://localhost:8000 npx tsx scripts/seed-hot-deals.ts
 *
 * Usage (AWS DynamoDB — credentials from ~/.aws/credentials or env):
 *   npx tsx scripts/seed-hot-deals.ts
 *
 * Safe to run multiple times — existing deals (matched by slug) are skipped.
 * Pass --force to overwrite.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { randomUUID } from 'crypto'
import path from 'path'
import staticOffers from '../src/data/offers.json'

const TABLE = process.env.HOT_DEALS_TABLE || 'HotDeals'
const REGION = process.env.REGION || 'eu-central-1'
const ENDPOINT = process.env.DYNAMODB_ENDPOINT
const FORCE = process.argv.includes('--force')

const isLocal = !!ENDPOINT && ENDPOINT.includes('localhost')

// Match the app's credential resolution: use project-local .aws/ folder
// (same as utils/ensureHotDealsTable.ts) when running outside AWS.
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

const raw = new DynamoDBClient(awsConfig)
const db = DynamoDBDocumentClient.from(raw)

async function main() {
  console.log(`\n→ Seeding ${isLocal ? 'LOCAL' : 'AWS'} DynamoDB (table: ${TABLE})`)
  if (FORCE) console.log('  --force: will overwrite existing deals')

  const existing = await db.send(new ScanCommand({ TableName: TABLE }))
  const bySlug = new Map<string, { dealId: string; slug: string }>()
  for (const item of existing.Items ?? []) {
    if (item.slug) bySlug.set(item.slug as string, item as { dealId: string; slug: string })
  }
  console.log(`  Existing deals in table: ${existing.Items?.length ?? 0}\n`)

  let inserted = 0
  let skipped = 0
  let overwritten = 0

  for (let i = 0; i < staticOffers.length; i++) {
    const source = staticOffers[i]
    const existingDeal = bySlug.get(source.slug)

    if (existingDeal && !FORCE) {
      console.log(`  ⊘ ${source.slug} — already exists (dealId=${existingDeal.dealId}), skipping`)
      skipped++
      continue
    }

    const dealId = existingDeal?.dealId ?? `deal-${randomUUID()}`
    const now = new Date().toISOString()

    const deal = {
      dealId,
      title: source.title,
      subtitle: source.subtitle,
      description: source.description,
      price: source.price,
      priceNum: source.priceNum,
      image: source.image,
      icon: source.icon,
      details: source.details,
      duration: source.duration,
      category: source.category,
      workType: source.workType,
      slug: source.slug,
      popular: source.popular ?? true,
      isActive: true,
      sortOrder: i,
      createdAt: existingDeal ? undefined : now,
      updatedAt: now,
    }

    // Strip undefined (DynamoDB Document Client doesn't like undefined)
    const cleaned = Object.fromEntries(
      Object.entries(deal).filter(([, v]) => v !== undefined)
    )

    await db.send(new PutCommand({ TableName: TABLE, Item: cleaned }))

    if (existingDeal) {
      console.log(`  ↻ ${source.slug} — overwritten (dealId=${dealId})`)
      overwritten++
    } else {
      console.log(`  + ${source.slug} — inserted (dealId=${dealId})`)
      inserted++
    }
  }

  console.log(
    `\n→ Done. Inserted: ${inserted}, overwritten: ${overwritten}, skipped: ${skipped}\n`
  )
}

main().catch((err) => {
  console.error('✗ Failed:', err)
  process.exit(1)
})
