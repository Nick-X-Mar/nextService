/**
 * Shared logic for the admin Errors feature: query CloudWatch for recent
 * error log entries, group them by fingerprint, and decorate each group
 * with persisted resolution state from the ErrorResolutions table.
 *
 * Used by /api/admin/errors/recent (the live list) and
 * /api/admin/errors/export (the markdown / json export).
 */
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureErrorResolutionsTable } from '@/utils/ensureErrorResolutionsTable'
import { fingerprintError } from '@/utils/errorFingerprint'
import { APP_LOG_GROUP, cloudWatchLogs } from '@/utils/cloudWatchLogs'
import { TABLES } from '@/lib/tables'
import { STAGE, type Stage } from '@/lib/site-url'

// The app's structured entries (src/utils/logger.ts), then the Lambdas, which
// log in the runtime's tab-separated text format.
const LAMBDA_LOG_GROUPS = [
  '/aws/lambda/nextservice-new-request-broadcast',
  '/aws/lambda/nextservice-ses-event-processor',
  '/aws/lambda/nextservice-appointment-completion-sweeper',
  '/aws/lambda/nextservice-appsync-authorizer',
  '/aws/lambda/nextservice-appsync-key-rotator'
]
const APP_PATTERN = '{ $.level = "error" || $.level = "warn" }'
const LAMBDA_PATTERN = '?ERROR ?WARN ?"Task timed out"'
const MAX_PAGES = 5

export const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
}

export type ErrorStatus = 'open' | 'resolved' | 'ignored'
export type StatusFilter = ErrorStatus | 'all'
export type LogLevelFilter = 'error' | 'warn' | 'all'

export interface ErrorGroup {
  fingerprint: string
  count: number
  firstSeen: string
  lastSeen: string
  logGroup: string
  level: 'error' | 'warn'
  stage: Stage
  /** The API route, ids masked — absent for a Lambda or a page render. */
  endpoint?: string
  title: string
  sampleMessage: string
  status: ErrorStatus
  notes?: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface GetErrorGroupsResult {
  groups: ErrorGroup[]
  stage: Stage
  totalErrors: number
  totalWarnings: number
  totalEntries: number
  totalGroups: number
}

interface ParsedEntry {
  timestamp: string
  logGroup: string
  level: 'error' | 'warn'
  stage: Stage
  endpoint?: string
  title: string
  /** What the fingerprint is taken over: the parts that name the error, not the occurrence. */
  seed: string
  detail: string
}

/** `/api/requests/req_8f3a…/accept/` → `/api/requests/:id/accept/` — one group per route. */
function maskPath(path: string): string {
  return path.replace(/\/[^/]*\d[^/]{5,}/g, '/:id')
}

function firstFrame(stack: unknown): string {
  if (typeof stack !== 'string') return ''
  return stack.split('\n').find((l) => /\bat\s/.test(l))?.trim() ?? ''
}

function parseAppEntry(raw: string, timestamp: string, logGroup: string): ParsedEntry | null {
  let entry: Record<string, unknown>
  try {
    entry = JSON.parse(raw)
  } catch {
    return null
  }
  const level = entry.level === 'warn' ? 'warn' : entry.level === 'error' ? 'error' : null
  if (!level) return null
  const error = (entry.error && typeof entry.error === 'object' ? entry.error : {}) as Record<string, unknown>
  const endpoint = typeof entry.endpoint === 'string' ? maskPath(entry.endpoint) : undefined
  const message = typeof entry.message === 'string' ? entry.message : ''
  const errorText = error.name ? `${error.name}: ${error.message ?? ''}` : ''
  const title = (message && errorText && !message.includes(String(error.message ?? '')))
    ? `${message} ${errorText}`
    : message || errorText
  return {
    timestamp,
    logGroup,
    level,
    stage: entry.stage === 'production' || entry.stage === 'staging' || entry.stage === 'local' ? entry.stage : STAGE,
    endpoint,
    title: endpoint ? maskPath(title) : title,
    seed: [level, endpoint ?? '', maskPath(message), error.name ?? '', error.code ?? '', firstFrame(error.stack)].join(' | '),
    detail: JSON.stringify(entry, null, 2)
  }
}

/** `2026-11-10T09:00:00.000Z\t<requestId>\tERROR\tmessage` — or a bare runtime line. */
function parseLambdaEntry(raw: string, timestamp: string, logGroup: string): ParsedEntry | null {
  const parts = raw.split('\t')
  const tag = parts.length >= 4 ? parts[2] : ''
  if (tag === 'INFO' || tag === 'DEBUG' || tag === 'TRACE') return null
  const message = (tag ? parts.slice(3).join('\t') : raw).trim()
  return {
    timestamp,
    logGroup,
    level: tag === 'WARN' ? 'warn' : 'error',
    stage: STAGE,
    title: message.split('\n')[0],
    seed: message,
    detail: raw
  }
}

async function filterAll(logGroupName: string, filterPattern: string, startTime: number, endTime: number) {
  const client = cloudWatchLogs()
  const events: { timestamp?: number; message?: string }[] = []
  let nextToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.send(
      new FilterLogEventsCommand({ logGroupName, startTime, endTime, filterPattern, limit: 1000, nextToken }),
      { abortSignal: AbortSignal.timeout(5_000) }
    )
    events.push(...(res.events || []))
    nextToken = res.nextToken
    if (!nextToken) break
  }
  return events
}

async function fetchCloudWatchEntries(rangeKey: string): Promise<ParsedEntry[]> {
  const ms = RANGE_MS[rangeKey] || RANGE_MS['24h']
  const now = Date.now()
  const startTime = now - ms

  const sources = [
    { logGroup: APP_LOG_GROUP, pattern: APP_PATTERN, parse: parseAppEntry },
    ...LAMBDA_LOG_GROUPS.map((logGroup) => ({ logGroup, pattern: LAMBDA_PATTERN, parse: parseLambdaEntry }))
  ]
  const results = await Promise.allSettled(
    sources.map((source) =>
      filterAll(source.logGroup, source.pattern, startTime, now).then((events) => ({ source, events }))
    )
  )

  const entries: ParsedEntry[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { source, events } = result.value
    for (const event of events) {
      const parsed = source.parse(event.message || '', new Date(event.timestamp || 0).toISOString(), source.logGroup)
      if (parsed) entries.push(parsed)
    }
  }
  return entries
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
            [TABLES.ErrorResolutions]: {
              Keys: chunk.map((fp) => ({ fingerprint: fp }))
            }
          }
        })
      )
      const items = (res.Responses?.[TABLES.ErrorResolutions] || []) as ResolutionRow[]
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
  levelFilter?: LogLevelFilter
}): Promise<GetErrorGroupsResult> {
  const levelFilter = opts.levelFilter ?? 'all'
  const all = await fetchCloudWatchEntries(opts.range)
  const totalErrors = all.filter((e) => e.level === 'error').length
  const totalWarnings = all.length - totalErrors
  const entries = levelFilter === 'all' ? all : all.filter((e) => e.level === levelFilter)

  // Group entries by fingerprint.
  const byFp = new Map<string, ErrorGroup>()
  for (const entry of entries) {
    const fp = fingerprintError(entry.seed, entry.logGroup)
    const existing = byFp.get(fp)
    if (!existing) {
      byFp.set(fp, {
        fingerprint: fp,
        count: 1,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
        logGroup: entry.logGroup,
        level: entry.level,
        stage: entry.stage,
        ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
        title: entry.title,
        sampleMessage: entry.detail,
        status: 'open'
      })
      continue
    }
    existing.count += 1
    if (entry.timestamp < existing.firstSeen) existing.firstSeen = entry.timestamp
    if (entry.timestamp > existing.lastSeen) {
      existing.lastSeen = entry.timestamp
      existing.sampleMessage = entry.detail
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
    stage: STAGE,
    totalErrors,
    totalWarnings,
    totalEntries: all.length,
    totalGroups
  }
}
