/**
 * A list of short free-text entries taken from a request body (a garage's
 * benefits): strings only, trimmed, de-duplicated, empty ones dropped, each
 * capped in length and the list capped in size.
 */
export function stringList(raw: unknown, max = 20, maxLength = 200): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (text && text.length <= maxLength && !out.includes(text)) out.push(text)
  }
  return out.slice(0, max)
}
