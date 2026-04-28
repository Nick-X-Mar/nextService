import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import {
  SESClient,
  DescribeConfigurationSetCommand,
  ConfigurationSetDoesNotExistException
} from '@aws-sdk/client-ses'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import { ensureEmailLogsTable } from '@/utils/ensureEventTables'
import { withMetrics } from '@/utils/withMetrics'

// What "the pipeline is healthy" means here:
//   1. SES Configuration Set "nextservice-main" exists
//   2. It has at least one ENABLED event destination
//   3. That destination subscribes to delivery+open+click+bounce+complaint
//   4. That destination points to an SNS topic ARN (we don't introspect SNS,
//      but the ARN being present is the visible piece from the SES side)
//   5. Recent EmailLogs rows show a healthy distribution: most "sent" rows
//      transition to "delivered" within ~10 min. If we have many "sent"
//      rows older than 10 min and zero "delivered", the pipeline is broken.
//
// All of these are *visible from the application side* — no AWS console
// digging required to spot what's wrong.

const SES_REGION = process.env.SES_REGION || process.env.REGION || 'eu-central-1'
const SES_CONFIG_SET = process.env.SES_CONFIG_SET || 'nextservice-main'
const REQUIRED_EVENT_TYPES = [
  'delivery',
  'open',
  'click',
  'bounce',
  'complaint'
]

let cachedSes: SESClient | null = null
function getSes(): SESClient {
  if (cachedSes) return cachedSes
  const config: ConstructorParameters<typeof SESClient>[0] = { region: SES_REGION }
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
      /* fall through to default chain */
    }
  }
  cachedSes = new SESClient(config)
  return cachedSes
}

interface DestinationCheck {
  name: string
  enabled: boolean
  matchingEventTypes: string[]
  missingEventTypes: string[]
  snsTopicArn?: string
  cloudWatchEnabled: boolean
  kinesisFirehoseEnabled: boolean
}

interface DiagnoseResult {
  configSetName: string
  envVarSet: boolean
  notificationsEnabled: boolean
  configSet: {
    exists: boolean
    error?: string
    eventDestinations: DestinationCheck[]
    hasEnabledSnsDestination: boolean
    coversAllEvents: boolean
  }
  pipelineHealth: {
    totalLast24h: number
    queued: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    stuckQueued: number
    stuckSent: number
    oldestStuckSentMinutes: number | null
  }
  verdict: {
    status: 'healthy' | 'degraded' | 'broken'
    issues: string[]
    nextSteps: string[]
  }
}

async function _GET(_request: NextRequest): Promise<NextResponse> {
  await ensureEmailLogsTable()

  const result: DiagnoseResult = {
    configSetName: SES_CONFIG_SET,
    envVarSet: !!process.env.SES_CONFIG_SET,
    notificationsEnabled:
      (process.env.NOTIFICATIONS_ENABLED ?? 'false').toLowerCase() === 'true',
    configSet: {
      exists: false,
      eventDestinations: [],
      hasEnabledSnsDestination: false,
      coversAllEvents: false
    },
    pipelineHealth: {
      totalLast24h: 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      stuckQueued: 0,
      stuckSent: 0,
      oldestStuckSentMinutes: null
    },
    verdict: { status: 'healthy', issues: [], nextSteps: [] }
  }

  // ── 1. Inspect the SES Configuration Set ─────────────────────
  try {
    const ses = getSes()
    const desc = await ses.send(
      new DescribeConfigurationSetCommand({
        ConfigurationSetName: SES_CONFIG_SET,
        ConfigurationSetAttributeNames: ['eventDestinations', 'reputationOptions']
      })
    )
    result.configSet.exists = true
    const dests = desc.EventDestinations || []
    for (const d of dests) {
      const types = (d.MatchingEventTypes || []).map((t) => String(t))
      const missing = REQUIRED_EVENT_TYPES.filter((t) => !types.includes(t))
      result.configSet.eventDestinations.push({
        name: d.Name || '(unnamed)',
        enabled: d.Enabled === true,
        matchingEventTypes: types,
        missingEventTypes: missing,
        snsTopicArn: d.SNSDestination?.TopicARN,
        cloudWatchEnabled: !!d.CloudWatchDestination,
        kinesisFirehoseEnabled: !!d.KinesisFirehoseDestination
      })
    }
    result.configSet.hasEnabledSnsDestination = dests.some(
      (d) => d.Enabled === true && !!d.SNSDestination?.TopicARN
    )
    result.configSet.coversAllEvents = dests.some(
      (d) =>
        d.Enabled === true &&
        REQUIRED_EVENT_TYPES.every((t) =>
          (d.MatchingEventTypes || []).map(String).includes(t)
        )
    )
  } catch (err) {
    if (err instanceof ConfigurationSetDoesNotExistException) {
      result.configSet.error = `Configuration set "${SES_CONFIG_SET}" does not exist in SES`
    } else {
      result.configSet.error =
        err instanceof Error ? err.message : 'Failed to describe configuration set'
    }
  }

  // ── 2. Inspect EmailLogs for the last 24h ─────────────────────
  // Single scan — EmailLogs has TTL of 180d; over 24h is < a few hundred
  // rows in a typical week, so cost is fine for an admin-only endpoint.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  try {
    const scan = await dynamoDB.send(
      new ScanCommand({
        TableName: 'EmailLogs',
        FilterExpression: 'sentAt >= :since',
        ExpressionAttributeValues: { ':since': since },
        ProjectionExpression: '#status, sentAt, deliveredAt',
        ExpressionAttributeNames: { '#status': 'status' }
      })
    )
    const items = scan.Items || []
    result.pipelineHealth.totalLast24h = items.length

    let oldestStuckSent = ''
    for (const it of items) {
      const s = String(it.status || '')
      const sentAt = String(it.sentAt || '')
      switch (s) {
        case 'queued':
          result.pipelineHealth.queued += 1
          // Stuck = queued and older than 5 min — the SES send call should
          // resolve in < 1s, so anything > 5 min means the call never
          // returned (Lambda timeout, fire-and-forget cold-shutdown, etc).
          if (sentAt && sentAt < fiveMinAgo) {
            result.pipelineHealth.stuckQueued += 1
          }
          break
        case 'sent':
          result.pipelineHealth.sent += 1
          // Stuck = sent and older than 10 min with no deliveredAt — SES
          // delivery events arrive within seconds. > 10 min = pipeline broken.
          if (sentAt && sentAt < tenMinAgo && !it.deliveredAt) {
            result.pipelineHealth.stuckSent += 1
            if (!oldestStuckSent || sentAt < oldestStuckSent) {
              oldestStuckSent = sentAt
            }
          }
          break
        case 'delivered':
          result.pipelineHealth.delivered += 1
          break
        case 'opened':
          result.pipelineHealth.opened += 1
          result.pipelineHealth.delivered += 1
          break
        case 'clicked':
          result.pipelineHealth.clicked += 1
          result.pipelineHealth.opened += 1
          result.pipelineHealth.delivered += 1
          break
        case 'bounced':
          result.pipelineHealth.bounced += 1
          break
        case 'failed':
        case 'rejected':
          result.pipelineHealth.failed += 1
          break
      }
    }
    if (oldestStuckSent) {
      result.pipelineHealth.oldestStuckSentMinutes = Math.round(
        (Date.now() - new Date(oldestStuckSent).getTime()) / 60000
      )
    }
  } catch (err) {
    console.error('[diagnose] EmailLogs scan failed:', err)
  }

  // ── 3. Build the verdict ─────────────────────────────────────
  const issues = result.verdict.issues
  const next = result.verdict.nextSteps

  if (!result.envVarSet) {
    issues.push('SES_CONFIG_SET env var is not set in the runtime')
    next.push(
      'Set SES_CONFIG_SET in next.config.ts env block AND in Amplify env vars (Amplify quirk: app vars need both for SSR runtime).'
    )
  }
  if (!result.notificationsEnabled) {
    issues.push('NOTIFICATIONS_ENABLED is false — emails are skipped, not sent')
    next.push('Set NOTIFICATIONS_ENABLED=true in Amplify env to enable real sends.')
  }
  if (!result.configSet.exists) {
    issues.push(
      result.configSet.error ||
        `SES Configuration Set "${SES_CONFIG_SET}" not found`
    )
    next.push(
      'Deploy the NextService-Notifications CDK stack: `cd infra && cdk deploy NextService-Notifications`.'
    )
  } else if (result.configSet.eventDestinations.length === 0) {
    issues.push('Configuration Set has zero event destinations — events go nowhere')
    next.push(
      'Re-deploy NextService-Notifications stack to recreate the SNS event destination.'
    )
  } else if (!result.configSet.hasEnabledSnsDestination) {
    issues.push('No enabled event destination points to an SNS topic')
    next.push(
      'Check the SES console: the destination must be enabled and point to the nextservice-ses-events SNS topic.'
    )
  } else if (!result.configSet.coversAllEvents) {
    const d = result.configSet.eventDestinations[0]
    issues.push(
      `Event destination "${d.name}" is missing event types: ${d.missingEventTypes.join(', ')}`
    )
    next.push(
      'Re-deploy NextService-Notifications — the matching_event_types list must include delivery/open/click/bounce/complaint.'
    )
  }

  if (result.pipelineHealth.stuckQueued > 0) {
    issues.push(
      `${result.pipelineHealth.stuckQueued} email(s) stuck at status="queued" — SES send never completed (Lambda cold-shutdown or timeout)`
    )
    next.push(
      'Check Amplify SSR logs for emailService timeouts. The fire-and-forget pattern in sendEmail() can drop sends when the Lambda exits before the promise resolves.'
    )
  }
  if (result.pipelineHealth.stuckSent > 0) {
    issues.push(
      `${result.pipelineHealth.stuckSent} email(s) stuck at status="sent" with no delivery event (oldest ${result.pipelineHealth.oldestStuckSentMinutes} min old) — SES events are not reaching the processor Lambda`
    )
    next.push(
      'Check CloudWatch Logs for /aws/lambda/nextservice-ses-event-processor — look for invocations and errors.'
    )
    next.push(
      'Verify the SNS topic nextservice-ses-events has the Lambda subscribed (SNS console → Subscriptions).'
    )
  }

  if (issues.length === 0) {
    result.verdict.status = 'healthy'
  } else if (
    !result.configSet.exists ||
    !result.configSet.hasEnabledSnsDestination ||
    result.pipelineHealth.stuckSent > 5
  ) {
    result.verdict.status = 'broken'
  } else {
    result.verdict.status = 'degraded'
  }

  return NextResponse.json(result)
}

export const GET = withMetrics(_GET)
