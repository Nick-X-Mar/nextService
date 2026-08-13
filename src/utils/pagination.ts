/**
 * Cursor pagination for DynamoDB-backed list endpoints.
 *
 * DynamoDB returns at most 1MB per Query/Scan page and hands back a
 * `LastEvaluatedKey` when there is more. Code that ignores that key silently
 * returns a partial result — no error, no warning, just missing rows once a
 * table grows. These helpers turn that key into an opaque cursor the client can
 * send back to ask for the next page.
 *
 * The cursor is base64 of the raw key. It is NOT a security boundary: a client
 * can decode or forge one, so every route must still apply its own
 * authorization to the query itself — the cursor only says "where to resume".
 */

export interface Page<T> {
  items: T[]
  /** Opaque cursor for the next page, or null when the list is exhausted. */
  nextCursor: string | null
}

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 30

/** Clamps a caller-supplied `limit` into a sane range. */
export function parseLimit(raw: string | null, fallback = DEFAULT_LIMIT): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), MAX_LIMIT)
}

/** Decodes a cursor back into a DynamoDB ExclusiveStartKey. */
export function decodeCursor(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    // A cursor must be a plain object of attribute values; anything else is
    // malformed or hand-crafted and is safer to ignore than to pass to the SDK.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** Encodes a DynamoDB LastEvaluatedKey into a cursor, or null when finished. */
export function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  if (!key) return null
  return Buffer.from(JSON.stringify(key), 'utf-8').toString('base64')
}

/**
 * Drains every page of a query.
 *
 * For lists the UI renders in full and that stay small by nature (one client's
 * vehicles, the offers on a single request). `maxPages` stops a runaway read;
 * reaching it is logged rather than quietly returning a short list.
 */
export async function collectAll<T>(
  runPage: (startKey?: Record<string, unknown>) => Promise<{
    Items?: T[]
    LastEvaluatedKey?: Record<string, unknown>
  }>,
  label: string,
  maxPages = 20
): Promise<T[]> {
  const items: T[] = []
  let startKey: Record<string, unknown> | undefined
  let pages = 0

  do {
    const res = await runPage(startKey)
    items.push(...((res.Items || []) as T[]))
    startKey = res.LastEvaluatedKey
    pages++
  } while (startKey && pages < maxPages)

  if (startKey) {
    console.warn(`[pagination] ${label}: stopped after ${maxPages} pages — result may be incomplete`)
  }

  return items
}
