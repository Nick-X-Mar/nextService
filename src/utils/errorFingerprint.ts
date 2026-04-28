import { createHash } from 'crypto'

/**
 * Compute a stable fingerprint for an error log entry. Two entries with the
 * same fingerprint are considered the same error (just different occurrences),
 * which lets us group duplicates in the admin UI and persist resolutions
 * keyed by fingerprint instead of by raw timestamp.
 *
 * The hash is over a normalized form of the first line of the stack trace
 * (or the first line of the message if no stack is present), with volatile
 * fragments — timestamps, UUIDs, line/column numbers, request ids — masked
 * out so the same logical error always produces the same id.
 */
export function fingerprintError(message: string, logGroup: string): string {
  const lines = message.split('\n')
  const stackLine = lines.find((l) => /\bat\s/.test(l))
  const seed = stackLine ?? lines[0] ?? ''

  const normalized = seed
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, '<TS>')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<UUID>')
    .replace(/:\d+:\d+/g, ':N:N')
    .replace(/\b\d{6,}\b/g, '<N>')
    .trim()

  const hash = createHash('sha1').update(`${logGroup}\n${normalized}`).digest('hex').slice(0, 8)
  return `err_${hash}`
}

/**
 * Take a single short title for an error group from the first non-empty
 * line of its sample message. Used in markdown export headers and in the
 * admin list row.
 */
export function shortTitle(message: string, max = 120): string {
  const first = message.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}
