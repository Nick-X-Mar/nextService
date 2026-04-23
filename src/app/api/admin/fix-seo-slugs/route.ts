import { NextResponse } from 'next/server'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'
import { withMetrics } from '@/utils/withMetrics'

// One-shot maintenance route: restores the original English slugs Google already
// indexed, keyed by title. Safe to run multiple times — a deal whose slug already
// matches is skipped.
// Protected by admin middleware (/api/admin/* requires admin cookie).
const TITLE_TO_SLUG: Record<string, string> = {
  'Συμπλέκτης': 'set_disk_all_cars',
  'Ιμάντας Χρονισμού με Αντλία Νερού': 'set-imantas-xronismou',
  'Μεγάλο Service Αυτοκινήτου': 'service-auto',
  'Ολική Βαφή': 'vafi-oliki',
  'Μερική Βαφή - Φανοποιεία': 'vafi-profylaktira-portas',
}

interface DealItem {
  dealId: string
  title?: string
  slug?: string
}

async function _POST() {
  try {
    await ensureHotDealsTable()

    const result = await dynamoDB.send(
      new ScanCommand({ TableName: HOT_DEALS_TABLE_NAME })
    )
    const deals = (result.Items ?? []) as DealItem[]

    const updated: Array<{ dealId: string; title: string; from: string; to: string }> = []
    const skipped: Array<{ dealId: string; title: string; reason: string }> = []

    for (const deal of deals) {
      const title = (deal.title ?? '').trim()
      const expected = TITLE_TO_SLUG[title]

      if (!expected) {
        skipped.push({
          dealId: deal.dealId,
          title,
          reason: 'title not in mapping',
        })
        continue
      }

      if (deal.slug === expected) {
        skipped.push({
          dealId: deal.dealId,
          title,
          reason: 'slug already correct',
        })
        continue
      }

      await dynamoDB.send(
        new UpdateCommand({
          TableName: HOT_DEALS_TABLE_NAME,
          Key: { dealId: deal.dealId },
          UpdateExpression: 'SET slug = :slug, updatedAt = :now',
          ExpressionAttributeValues: {
            ':slug': expected,
            ':now': new Date().toISOString(),
          },
        })
      )

      updated.push({
        dealId: deal.dealId,
        title,
        from: deal.slug ?? '',
        to: expected,
      })
    }

    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      updated,
      skipped,
    })
  } catch (error) {
    console.error('fix-seo-slugs error:', error)
    return NextResponse.json(
      { error: 'Failed to fix slugs' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
