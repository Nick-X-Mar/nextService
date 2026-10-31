import { DeleteCommand, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureSiteContentTable } from '@/utils/ensureSiteContentTable'
import { createTtlCache } from '@/utils/ttlCache'
import { TABLES } from '@/lib/tables'
import type { EmailTemplateName } from '@/types/events'
import { TOKEN_PATTERN } from '@/lib/email-templates'
import { emailDefinition, type EmailCopy, type EmailDefinition } from '@/lib/email-templates/catalog'

/**
 * The admin-editable copy of the emails, stored in SiteContent as
 * `email:<templateName>` rows next to the page CMS.
 *
 * Same rule as src/lib/site-content.ts: the catalog's copy is the floor. A
 * missing row, a throttled read or a half-filled row degrades to the shipped
 * text, field by field — never to an empty email. Reset deletes the row.
 *
 * The two Lambdas read the same row for their own email (`email:new_request_for_garages`,
 * `email:completion_prompt_garage`), with the same field-by-field fallback.
 */

const CACHE_TTL_MS = 60_000
const cache = createTtlCache<StoredEmailCopy | null>(CACHE_TTL_MS)

const COPY_FIELDS = ['subject', 'heading', 'body', 'ctaLabel', 'note'] as const

const LIMITS: Record<(typeof COPY_FIELDS)[number], number> = {
  subject: 150,
  heading: 150,
  body: 3000,
  ctaLabel: 50,
  note: 600,
}

export interface StoredEmailCopy extends Partial<EmailCopy> {
  pageKey: string
  updatedAt?: string
  updatedBy?: string
}

export const emailContentKey = (name: EmailTemplateName) => `email:${name}`

async function readOverride(name: EmailTemplateName): Promise<StoredEmailCopy | null> {
  return cache.getOrCompute(name, async () => {
    await ensureSiteContentTable()
    const res = await dynamoDB.send(
      new GetCommand({ TableName: TABLES.SiteContent, Key: { pageKey: emailContentKey(name) } })
    )
    return (res.Item as StoredEmailCopy | undefined) || null
  })
}

/** Lays a stored row over the shipped copy, one field at a time. */
export function mergeCopy(defaults: EmailCopy, stored: Partial<EmailCopy> | null | undefined): EmailCopy {
  const merged = { ...defaults }
  if (!stored) return merged
  for (const key of COPY_FIELDS) {
    const value = stored[key]
    // ctaLabel and note may be cleared on purpose; subject, heading and body may not.
    if (typeof value === 'string' && (value.trim() || key === 'note' || key === 'heading')) merged[key] = value
  }
  return merged
}

/** The copy an email goes out with. Never throws. */
export async function getEmailCopy(name: EmailTemplateName): Promise<EmailCopy | undefined> {
  const definition = emailDefinition(name)
  if (!definition) return undefined
  try {
    return mergeCopy(definition.copy, await readOverride(name))
  } catch (err) {
    console.error(`[email-content] falling back to the shipped copy for ${name}:`, err)
    return definition.copy
  }
}

/** Every stored override, for the admin list. */
export async function listEmailOverrides(): Promise<Map<string, StoredEmailCopy>> {
  await ensureSiteContentTable()
  const res = await dynamoDB.send(
    new ScanCommand({
      TableName: TABLES.SiteContent,
      FilterExpression: 'begins_with(pageKey, :prefix)',
      ExpressionAttributeValues: { ':prefix': 'email:' },
    })
  )
  const map = new Map<string, StoredEmailCopy>()
  for (const item of (res.Items || []) as StoredEmailCopy[]) {
    map.set(item.pageKey.slice('email:'.length), item)
  }
  return map
}

export class EmailCopyValidationError extends Error {}

/**
 * Checks an admin's draft. A token the email does not have is refused rather
 * than sent as a literal `{…}` — a typo there would reach every recipient.
 */
export function validateEmailCopy(definition: EmailDefinition, input: unknown): EmailCopy {
  const body = (input || {}) as Record<string, unknown>
  const copy = {} as EmailCopy
  for (const key of COPY_FIELDS) {
    const value = body[key]
    copy[key] = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
    if (copy[key].length > LIMITS[key]) {
      throw new EmailCopyValidationError(`${FIELD_LABELS[key]}: έως ${LIMITS[key]} χαρακτήρες.`)
    }
  }
  if (!copy.subject) throw new EmailCopyValidationError('Το θέμα δεν μπορεί να είναι κενό.')
  if (!copy.body) throw new EmailCopyValidationError('Το κείμενο δεν μπορεί να είναι κενό.')
  // The button is the point of most of these emails: it is what takes the
  // recipient back into the app.
  if (definition.ctaUrl && !copy.ctaLabel) {
    throw new EmailCopyValidationError('Το κουμπί χρειάζεται κείμενο — είναι ο σύνδεσμος προς την εφαρμογή.')
  }
  if (/<[a-z/!]/i.test(Object.values(copy).join(' '))) {
    throw new EmailCopyValidationError('Δεν επιτρέπεται HTML. Για έντονα γράμματα γράψε **κείμενο**.')
  }

  const known = new Set(definition.variables.map((v) => v.token))
  for (const key of COPY_FIELDS) {
    for (const [, token] of copy[key].matchAll(TOKEN_PATTERN)) {
      if (!known.has(token)) {
        throw new EmailCopyValidationError(
          known.size
            ? `Άγνωστο πεδίο {${token}}. Διαθέσιμα: ${[...known].map((t) => `{${t}}`).join(', ')}.`
            : `Άγνωστο πεδίο {${token}}. Αυτό το email δεν έχει πεδία.`
        )
      }
    }
  }
  return copy
}

const FIELD_LABELS: Record<(typeof COPY_FIELDS)[number], string> = {
  subject: 'Θέμα',
  heading: 'Τίτλος',
  body: 'Κείμενο',
  ctaLabel: 'Κουμπί',
  note: 'Σημείωση',
}

export async function saveEmailCopy(
  name: EmailTemplateName,
  copy: EmailCopy,
  updatedBy: string
): Promise<StoredEmailCopy> {
  await ensureSiteContentTable()
  const item: StoredEmailCopy = {
    pageKey: emailContentKey(name),
    ...copy,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await dynamoDB.send(new PutCommand({ TableName: TABLES.SiteContent, Item: item }))
  cache.invalidate(name)
  return item
}

/** Back to the shipped copy: deletes the row, never writes the defaults as one. */
export async function resetEmailCopy(name: EmailTemplateName): Promise<void> {
  await ensureSiteContentTable()
  await dynamoDB.send(
    new DeleteCommand({ TableName: TABLES.SiteContent, Key: { pageKey: emailContentKey(name) } })
  )
  cache.invalidate(name)
}
