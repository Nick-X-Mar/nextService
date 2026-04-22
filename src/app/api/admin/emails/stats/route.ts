import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { withMetrics } from '@/utils/withMetrics'

// Status → display bucket. Mirrored on the admin UI so KPI cards, stats
// breakdowns, and list badges all agree. Keep in sync with:
//   - src/app/admin/emails/page.tsx (status badge colors)
//   - SES event processor Lambda (what it writes as `status`)
const TRACKED_STATUSES = [
  'queued',
  'skipped',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'deliveryDelayed',
  'bounced',
  'complained',
  'rejected',
  'failed'
] as const

// Thresholds the UI uses to turn KPI cards red. Well below the AWS SES
// auto-suspension thresholds (10% / 0.5%) so we have warning time.
const BOUNCE_RATE_WARN = 0.03 // 3%
const COMPLAINT_RATE_WARN = 0.001 // 0.1%

async function _GET(request: NextRequest) {
  try {
    await ensureEmailLogsTable()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString()
    const to = searchParams.get('to') || new Date().toISOString()

    const fromISO = from.includes('T') ? from : `${from}T00:00:00.000Z`
    const toISO = to.includes('T') ? to : `${to}T23:59:59.999Z`

    // One Query per status via StatusIndex, in parallel. COUNT-only = cheap.
    const counts = await Promise.all(
      TRACKED_STATUSES.map((status) =>
        dynamoDB.send(new QueryCommand({
          TableName: 'EmailLogs',
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status AND sentAt BETWEEN :from AND :to',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ':from': fromISO, ':to': toISO },
          Select: 'COUNT'
        }))
      )
    )

    const byStatus: Record<string, number> = {}
    TRACKED_STATUSES.forEach((status, i) => {
      byStatus[status] = counts[i].Count || 0
    })

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)

    // Track how many emails we attempted to actually send (skipped/queued
    // don't count). Used as the denominator for delivery/bounce/open/click
    // rates so they reflect deliverability, not send volume.
    const attempted =
      total -
      (byStatus.skipped || 0) -
      (byStatus.queued || 0)

    // Delivered = status "delivered" + every status that implies a prior
    // delivery (opened/clicked). Same idea for opened: clicks imply opens.
    const delivered =
      (byStatus.delivered || 0) +
      (byStatus.opened || 0) +
      (byStatus.clicked || 0)
    const opened = (byStatus.opened || 0) + (byStatus.clicked || 0)
    const clicked = byStatus.clicked || 0
    const bounced = byStatus.bounced || 0
    const complained = byStatus.complained || 0
    const failed = (byStatus.failed || 0) + (byStatus.rejected || 0)

    const rate = (n: number, d: number) => (d > 0 ? n / d : 0)

    const rates = {
      deliveryRate: rate(delivered, attempted),
      bounceRate: rate(bounced, attempted),
      complaintRate: rate(complained, attempted),
      openRate: rate(opened, delivered),
      clickRate: rate(clicked, delivered),
      // Click-through rate among recipients who opened (tells us whether
      // the CTA is working, separate from whether emails are being read).
      clickThroughRate: rate(clicked, opened),
      failureRate: rate(failed, total)
    }

    const warnings = {
      bounceRateHigh: rates.bounceRate > BOUNCE_RATE_WARN,
      complaintRateHigh: rates.complaintRate > COMPLAINT_RATE_WARN
    }

    // Template breakdown — single scan, project only what we need.
    const scanResult = await dynamoDB.send(new ScanCommand({
      TableName: 'EmailLogs',
      FilterExpression: 'sentAt BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':from': fromISO, ':to': toISO },
      ProjectionExpression: 'templateName, #status',
      ExpressionAttributeNames: { '#status': 'status' }
    }))

    const byTemplate: Record<string, number> = {}
    const byTemplateStatus: Record<string, Record<string, number>> = {}
    for (const item of scanResult.Items || []) {
      const name = (item.templateName as string) || 'unknown'
      byTemplate[name] = (byTemplate[name] || 0) + 1
      const st = (item.status as string) || 'unknown'
      byTemplateStatus[name] = byTemplateStatus[name] || {}
      byTemplateStatus[name][st] = (byTemplateStatus[name][st] || 0) + 1
    }

    return NextResponse.json({
      byStatus,
      byTemplate,
      byTemplateStatus,
      total,
      funnel: {
        attempted,
        sent: byStatus.sent || 0,
        delivered,
        opened,
        clicked,
        bounced,
        complained,
        failed
      },
      rates,
      warnings,
      thresholds: {
        bounceRateWarn: BOUNCE_RATE_WARN,
        complaintRateWarn: COMPLAINT_RATE_WARN
      }
    })
  } catch (error) {
    console.error('Email stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch email stats' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
