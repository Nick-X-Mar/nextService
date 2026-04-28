/**
 * Shared logic for the admin Errors feature: query CloudWatch for recent
 * error log entries, group them by fingerprint, and decorate each group
 * with persisted resolution state from the ErrorResolutions table.
 *
 * Used by /api/admin/errors/recent (the live list) and
 * /api/admin/errors/export (the markdown / json export).
 */
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand
} from '@aws-sdk/client-cloudwatch-logs'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import {
  ensureErrorResolutionsTable,
  ERROR_RESOLUTIONS_TABLE
} from '@/utils/ensureErrorResolutionsTable'
import { fingerprintError } from '@/utils/errorFingerprint'

const REGION = process.env.REGION || 'eu-central-1'
const LOG_GROUPS = [
  '/nextservice/app',
  '/nextservice/api',
  '/aws/lambda/nextservice-new-request-broadcast',
  '/aws/lambda/nextservice-ses-event-processor',
  '/aws/lambda/nextservice-appsync-key-rotator'
]

export const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
}

export type ErrorStatus = 'open' | 'resolved' | 'ignored'
export type StatusFilter = ErrorStatus | 'all'

export interface ErrorGroup {
  fingerprint: string
  count: number
  firstSeen: string
  lastSeen: string
  logGroup: string
  sampleMessage: string
  status: ErrorStatus
  notes?: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface GetErrorGroupsResult {
  groups: ErrorGroup[]
  total5xx: number
  total4xx: number
  totalEntries: number
  totalGroups: number
}

let cwClient: CloudWatchLogsClient | null = null
function getCloudWatchClient(): CloudWatchLogsClient {
  if (cwClient) return cwClient

  const config: ConstructorParameters<typeof CloudWatchLogsClient>[0] = {
    region: REGION,
    requestHandler: { requestTimeout: 5_000 }
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

  cwClient = new CloudWatchLogsClient(config)
  return cwClient
}

interface RawEntry {
  timestamp: string
  message: string
  logGroup: string
}

async function fetchCloudWatchEntries(rangeKey: string): Promise<{
  entries: RawEntry[]
  total5xx: number
  total4xx: number
}> {
  const ms = RANGE_MS[rangeKey] || RANGE_MS['24h']
  const now = Date.now()
  const startTime = now - ms

  const client = getCloudWatchClient()

  const results = await Promise.allSettled(
    LOG_GROUPS.map((logGroup) =>
      client
        .send(
          new FilterLogEventsCommand({
            logGroupName: logGroup,
            startTime,
            endTime: now,
            filterPattern:
              '?"ERROR" ?"error" ?"status: 500" ?"status: 502" ?"status: 503" ?"5xx"',
            limit: 1000
          }),
          { abortSignal: AbortSignal.timeout(5_000) }
        )
        .then((res) => ({ logGroup, events: res.events || [] }))
    )
  )

  const entries: RawEntry[] = []
  let total5xx = 0
  let total4xx = 0

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const event of result.value.events) {
      const msg = event.message || ''
      entries.push({
        timestamp: new Date(event.timestamp || 0).toISOString(),
        message: msg,
        logGroup: result.value.logGroup
      })
      if (/status[:\s]*5\d{2}/i.test(msg) || /\b5\d{2}\b/.test(msg)) total5xx++
      if (/status[:\s]*4\d{2}/i.test(msg)) total4xx++
    }
  }

  return { entries, total5xx, total4xx }
}

interface ResolutionRow {
  fingerprint: string
  status: 'resolved' | 'ignored'
  notes?: string
  resolvedAt?: string
  resolvedBy?: string
}

async function loadResolutions(fingerprints: string[]): Promise<Map<string, ResolutionRow>> {
  const map = new Map<string, ResolutionRow>()
  if (fingerprints.length === 0) return map

  await ensureErrorResolutionsTable()

  // BatchGet has a max of 100 keys per request — chunk just in case.
  const chunks: string[][] = []
  for (let i = 0; i < fingerprints.length; i += 100) {
    chunks.push(fingerprints.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    try {
      const res = await dynamoDB.send(
        new BatchGetCommand({
          RequestItems: {
            [ERROR_RESOLUTIONS_TABLE]: {
              Keys: chunk.map((fp) => ({ fingerprint: fp }))
            }
          }
        })
      )
      const items = (res.Responses?.[ERROR_RESOLUTIONS_TABLE] || []) as ResolutionRow[]
      for (const item of items) {
        if (item?.fingerprint) map.set(item.fingerprint, item)
      }
    } catch (err) {
      // Table may not exist yet locally — fall through with no decorations.
      console.warn('[errorGroups] Failed to BatchGet resolutions:', err instanceof Error ? err.message : err)
    }
  }

  return map
}

export async function getErrorGroups(opts: {
  range: string
  statusFilter: StatusFilter
}): Promise<GetErrorGroupsResult> {
  const { entries, total5xx, total4xx } = await fetchCloudWatchEntries(opts.range)

  // Group entries by fingerprint.
  const byFp = new Map<string, ErrorGroup>()
  for (const entry of entries) {
    const fp = fingerprintError(entry.message, entry.logGroup)
    const existing = byFp.get(fp)
    if (!existing) {
      byFp.set(fp, {
        fingerprint: fp,
        count: 1,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
        logGroup: entry.logGroup,
        sampleMessage: entry.message,
        status: 'open'
      })
      continue
    }
    existing.count += 1
    if (entry.timestamp < existing.firstSeen) existing.firstSeen = entry.timestamp
    if (entry.timestamp > existing.lastSeen) {
      existing.lastSeen = entry.timestamp
      existing.sampleMessage = entry.message
    }
  }

  // Decorate with persisted resolutions.
  const resolutions = await loadResolutions(Array.from(byFp.keys()))
  for (const group of byFp.values()) {
    const r = resolutions.get(group.fingerprint)
    if (r) {
      group.status = r.status
      group.notes = r.notes
      group.resolvedAt = r.resolvedAt
      group.resolvedBy = r.resolvedBy
    }
  }

  let groups = Array.from(byFp.values()).sort((a, b) =>
    b.lastSeen.localeCompare(a.lastSeen)
  )
  const totalGroups = groups.length

  if (opts.statusFilter !== 'all') {
    groups = groups.filter((g) => g.status === opts.statusFilter)
  }

  return {
    groups,
    total5xx,
    total4xx,
    totalEntries: entries.length,
    totalGroups
  }
}
