import { NextRequest, NextResponse } from 'next/server'
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand
} from '@aws-sdk/client-cloudwatch-logs'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

const REGION = process.env.REGION || 'eu-central-1'
const LOG_GROUPS = ['/nextservice/app', '/nextservice/api']

function getCloudWatchClient(): CloudWatchLogsClient {
  const config: ConstructorParameters<typeof CloudWatchLogsClient>[0] = {
    region: REGION
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

  return new CloudWatchLogsClient(config)
}

const rangeMs: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '24h'
    const ms = rangeMs[range] || rangeMs['24h']

    const now = Date.now()
    const startTime = now - ms

    const client = getCloudWatchClient()

    // Query all log groups in parallel
    const results = await Promise.allSettled(
      LOG_GROUPS.map((logGroup) =>
        client.send(new FilterLogEventsCommand({
          logGroupName: logGroup,
          startTime,
          endTime: now,
          filterPattern: '?"ERROR" ?"error" ?"status: 500" ?"status: 502" ?"status: 503" ?"5xx"',
          limit: 50
        })).then((res) => ({
          logGroup,
          events: res.events || []
        }))
      )
    )

    const entries: Array<{ timestamp: string; message: string; logGroup: string }> = []
    let total5xx = 0
    let total4xx = 0

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const event of result.value.events) {
          entries.push({
            timestamp: new Date(event.timestamp || 0).toISOString(),
            message: event.message || '',
            logGroup: result.value.logGroup
          })
          // Count 5xx and 4xx
          const msg = event.message || ''
          if (/status[:\s]*5\d{2}/i.test(msg) || /\b5\d{2}\b/.test(msg)) total5xx++
          if (/status[:\s]*4\d{2}/i.test(msg)) total4xx++
        }
      }
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    return NextResponse.json({
      entries: entries.slice(0, 50),
      total5xx,
      total4xx
    })
  } catch (error) {
    console.error('Error monitoring error:', error)
    // Return empty state instead of error — CloudWatch might not be configured locally
    return NextResponse.json({ entries: [], total5xx: 0, total4xx: 0 })
  }
}
