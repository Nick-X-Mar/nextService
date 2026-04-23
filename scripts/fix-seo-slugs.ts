/**
 * Restore the original English slugs Google already indexed, keyed by title.
 *
 * Usage:
 *   npx tsx scripts/fix-seo-slugs.ts               # local DynamoDB (default)
 *   DYNAMODB_ENDPOINT= npx tsx scripts/fix-seo-slugs.ts  # AWS (no endpoint)
 *
 * Safe to run multiple times — deals with correct slug are skipped.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.HOT_DEALS_TABLE || 'HotDeals'
const REGION = process.env.REGION || 'eu-central-1'
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'

const TITLE_TO_SLUG: Record<string, string> = {
  'Συμπλέκτης': 'set_disk_all_cars',
  'Ιμάντας Χρονισμού με Αντλία Νερού': 'set-imantas-xronismou',
  'Μεγάλο Service Αυτοκινήτου': 'service-auto',
  'Ολική Βαφή': 'vafi-oliki',
  'Μερική Βαφή - Φανοποιεία': 'vafi-profylaktira-portas',
}

const isLocal = !!ENDPOINT && ENDPOINT.includes('localhost')

const raw = new DynamoDBClient(
  isLocal
    ? {
        region: 'localhost',
        endpoint: ENDPOINT,
        credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
      }
    : { region: REGION }
)
const db = DynamoDBDocumentClient.from(raw)

interface Deal {
  dealId: string
  title?: string
  slug?: string
}

async function main() {
  console.log(`\n→ Connecting to ${isLocal ? 'LOCAL' : 'AWS'} DynamoDB (table: ${TABLE})`)

  const result = await db.send(new ScanCommand({ TableName: TABLE }))
  const deals = (result.Items ?? []) as Deal[]
  console.log(`  Found ${deals.length} deals\n`)

  let updated = 0
  let skipped = 0

  for (const deal of deals) {
    const title = (deal.title ?? '').trim()
    const expected = TITLE_TO_SLUG[title]

    if (!expected) {
      console.log(`  ⊘ ${deal.dealId}  "${title}" — not in mapping, skipping`)
      skipped++
      continue
    }

    if (deal.slug === expected) {
      console.log(`  ✓ ${deal.dealId}  "${title}" — already "${expected}"`)
      skipped++
      continue
    }

    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { dealId: deal.dealId },
        UpdateExpression: 'SET slug = :slug, updatedAt = :now',
        ExpressionAttributeValues: {
          ':slug': expected,
          ':now': new Date().toISOString(),
        },
      })
    )
    console.log(`  ✎ ${deal.dealId}  "${title}"  "${deal.slug}" → "${expected}"`)
    updated++
  }

  console.log(`\n→ Done. Updated: ${updated}, skipped: ${skipped}\n`)
}

main().catch((err) => {
  console.error('✗ Failed:', err)
  process.exit(1)
})
