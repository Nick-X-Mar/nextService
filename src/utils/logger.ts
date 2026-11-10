/**
 * Structured server logging.
 *
 * Every warning and error the server logs becomes one JSON entry —
 * `{ timestamp, level, stage, message, endpoint, method, error, ... }` — that
 * is printed as a single line and, on a deployed stage, also written straight
 * to the `/nextservice/app` log group. The admin Errors page reads that group
 * and filters on the fields (`{ $.level = "error" }`).
 *
 * We write the group ourselves instead of trusting Amplify to capture stdout:
 * production's SSR output never reached CloudWatch in any region, so its
 * errors were invisible.
 *
 * `installConsoleCapture()` (from `src/instrumentation.ts`) routes every
 * existing `console.warn` / `console.error` through here, so the route
 * handlers' `console.error('… error:', error)` calls need no change. Entries are
 * buffered; `withMetrics` and `onRequestError` await `flushLogs()` before the
 * response goes out, because Amplify freezes the function the moment it
 * responds and an un-awaited write may never happen.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { format } from 'node:util'
import { CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { APP_LOG_GROUP, cloudWatchLogs } from '@/utils/cloudWatchLogs'
import { STAGE } from '@/lib/site-url'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  stage: typeof STAGE
  message: string
  endpoint?: string
  method?: string
  userType?: string
  userId?: string
  requestId?: string
  error?: { name: string; message: string; code?: string; stack?: string }
  [key: string]: unknown
}

interface RequestContext {
  endpoint: string
  method: string
  userType?: string
  userId?: string
  requestId: string
  /** An error was already logged for this request, so its 5xx line adds nothing. */
  errorLogged?: boolean
}

const requestContext = new AsyncLocalStorage<RequestContext>()

/** Runs `fn` with the request's route and caller attached to every entry it logs. */
export function withLogContext<T>(context: Omit<RequestContext, 'requestId'>, fn: () => T): T {
  return requestContext.run({ ...context, requestId: randomBytes(6).toString('hex') }, fn)
}

export function currentLogContext(): RequestContext | undefined {
  return requestContext.getStore()
}

// Only a deployed server ships; a local one would write into staging's group.
const SHIPPING = STAGE !== 'local'
const MAX_MESSAGE = 4_000
const MAX_STACK = 4_000
const INSTANCE = randomBytes(4).toString('hex')

// The console as it was before capture — the logger prints through these, so
// nothing it does can loop back into itself.
const original = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function describeError(err: unknown): LogEntry['error'] | undefined {
  if (!(err instanceof Error)) return undefined
  const code = (err as { code?: unknown; Code?: unknown }).code ?? (err as { Code?: unknown }).Code
  return {
    name: err.name,
    message: clip(err.message, MAX_MESSAGE),
    ...(typeof code === 'string' ? { code } : {}),
    ...(err.stack ? { stack: clip(err.stack, MAX_STACK) } : {}),
  }
}

/** `console.error('Offer create error:', err)` → message "Offer create error:" + the error's fields. */
function entryFromArgs(level: LogLevel, args: unknown[]): LogEntry {
  const err = args.find((a) => a instanceof Error)
  const rest = args.filter((a) => a !== err)
  return buildEntry(level, rest.length > 0 ? format(...rest) : '', { error: err })
}

// Errors already written, so the same throw reaching `onRequestError` after a
// handler logged it is not counted twice.
const loggedErrors = new WeakSet<object>()

export function alreadyLogged(err: unknown): boolean {
  return typeof err === 'object' && err !== null && loggedErrors.has(err)
}

function buildEntry(level: LogLevel, message: string, fields: Record<string, unknown> = {}): LogEntry {
  const ctx = requestContext.getStore()
  const { error, ...extra } = fields
  if (typeof error === 'object' && error !== null) loggedErrors.add(error)
  const described = describeError(error)
  const text = message.trim() || described?.message || ''
  return {
    timestamp: new Date().toISOString(),
    level,
    stage: STAGE,
    message: clip(text, MAX_MESSAGE),
    ...(ctx ? {
      endpoint: ctx.endpoint,
      method: ctx.method,
      requestId: ctx.requestId,
      ...(ctx.userType ? { userType: ctx.userType } : {}),
      ...(ctx.userId ? { userId: ctx.userId } : {}),
    } : {}),
    ...extra,
    ...(described ? { error: described } : {}),
  }
}

// ── Shipping ────────────────────────────────────────────────────────────────

let queue: LogEntry[] = []
let inFlight: Promise<void> = Promise.resolve()
let timer: ReturnType<typeof setTimeout> | null = null
const createdStreams = new Set<string>()

function enqueue(entry: LogEntry) {
  if (!SHIPPING) return
  queue.push(entry)
  // Catches what no request awaits (a page render, a timer). Best effort:
  // the requests that matter flush before they respond.
  if (!timer) {
    timer = setTimeout(() => { timer = null; void flushLogs() }, 2_000)
    timer.unref?.()
  }
}

async function ship(batch: LogEntry[]) {
  const client = cloudWatchLogs()
  // One stream per stage, day and server instance: PutLogEvents needs no
  // sequence token, but a stream per instance keeps the lines of one cold
  // start together when reading them in the console.
  const stream = `${STAGE}/${new Date().toISOString().slice(0, 10)}/${INSTANCE}`
  if (!createdStreams.has(stream)) {
    try {
      await client.send(new CreateLogStreamCommand({ logGroupName: APP_LOG_GROUP, logStreamName: stream }))
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ResourceAlreadyExistsException')) throw err
    }
    createdStreams.add(stream)
  }
  await client.send(new PutLogEventsCommand({
    logGroupName: APP_LOG_GROUP,
    logStreamName: stream,
    logEvents: batch
      .map((e) => ({ timestamp: Date.parse(e.timestamp), message: JSON.stringify(e) }))
      .sort((a, b) => a.timestamp - b.timestamp),
  }))
}

/** Writes whatever is buffered. Never rejects; a failure is printed, not re-logged. */
export function flushLogs(): Promise<void> {
  if (queue.length === 0) return inFlight
  const batch = queue
  queue = []
  inFlight = inFlight.then(() => ship(batch)).catch((err) => {
    original.error(JSON.stringify(buildEntry('error', 'Log shipping to CloudWatch failed', { error: err, dropped: batch.length })))
  })
  return inFlight
}

// ── API ─────────────────────────────────────────────────────────────────────

function write(entry: LogEntry, toCloudWatch: boolean) {
  const line = JSON.stringify(entry)
  if (entry.level === 'error') original.error(line)
  else if (entry.level === 'warn') original.warn(line)
  else original.log(line)
  if (entry.level === 'error') {
    const ctx = requestContext.getStore()
    if (ctx) ctx.errorLogged = true
  }
  if (toCloudWatch) enqueue(entry)
}

/**
 * Explicit structured logging, for lines worth filtering on. `fields` are
 * merged into the entry; pass an `error` field to get its name, code and stack.
 * Only warnings and errors are shipped to CloudWatch.
 */
export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write(buildEntry('info', message, fields), false),
  warn: (message: string, fields?: Record<string, unknown>) => write(buildEntry('warn', message, fields), true),
  error: (message: string, fields?: Record<string, unknown>) => write(buildEntry('error', message, fields), true),
}

let installed = false

// Framework notices that are still printed but not shipped. Next warns about
// metadataBase on every self-hosted production server that has an
// `opengraph-image` file, even with metadataBase set — and then uses ours.
const NOT_SHIPPED = [/^⚠ metadataBase property in metadata export is not set/]

/**
 * Turns `console.warn` / `console.error` into structured entries on a deployed
 * server. Local dev keeps the plain console, where a readable stack matters
 * more than a JSON line.
 */
export function installConsoleCapture() {
  if (installed || !SHIPPING) return
  installed = true
  console.warn = (...args: unknown[]) => {
    const entry = entryFromArgs('warn', args)
    write(entry, !NOT_SHIPPED.some((pattern) => pattern.test(entry.message)))
  }
  console.error = (...args: unknown[]) => write(entryFromArgs('error', args), true)
}
