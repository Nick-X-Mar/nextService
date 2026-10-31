import {
  EMAIL_AUDIENCE_LABELS,
  type EmailCopy,
  type EmailDefinition,
} from '@/lib/email-templates/catalog'
import type { StoredEmailCopy } from '@/lib/email-content'

/** What the admin pages get of a catalog entry — no functions, no URL builders. */
export function describeEmail(definition: EmailDefinition, copy: EmailCopy, stored?: StoredEmailCopy | null) {
  return {
    name: definition.name,
    label: definition.label,
    audience: definition.audience,
    audienceLabel: EMAIL_AUDIENCE_LABELS[definition.audience],
    trigger: definition.trigger,
    sentBy: definition.sentBy,
    hasCta: !!definition.ctaUrl,
    variables: definition.variables.map(({ token, label, example }) => ({ token, label, example })),
    copy,
    defaults: definition.copy,
    customized: !!stored,
    updatedAt: stored?.updatedAt,
    updatedBy: stored?.updatedBy,
  }
}
