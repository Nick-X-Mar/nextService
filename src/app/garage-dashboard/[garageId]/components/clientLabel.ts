/**
 * How the garage screens name a client.
 *
 * Until a garage wins the job the API sends the first name only, and nothing at
 * all when the account has no real name (see src/utils/garageClientView.ts) —
 * so every field here is optional and the label falls back to «Πελάτης».
 */
export interface ClientLabelSource {
  firstName?: string | null
  lastName?: string | null
}

export function clientDisplayName(client?: ClientLabelSource | null): string {
  const name = [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim()
  return name || 'Πελάτης'
}

/** Up to two initials, or '' when there is no name to take them from. */
export function clientInitials(client?: ClientLabelSource | null): string {
  return [client?.firstName, client?.lastName]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('')
}

/** A `tel:` href from a number as the client typed it ("69 1234-5678"). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
