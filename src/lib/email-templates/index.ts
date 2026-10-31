import type { EmailTemplateName } from '@/types/events'
import { baseLayout } from './baseLayout'
import { emailDefinition, type EmailCopy, type EmailDefinition } from './catalog'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  /** The button's target, as written into the HTML (entity-escaped). */
  ctaUrl?: string
}

/** `{token}`: a brace pair around anything but braces and line breaks. */
export const TOKEN_PATTERN = /\{([^{}\n]{1,40})\}/g

/**
 * Renders one email from its catalog entry and a copy — the shipped one, or an
 * admin's override (src/lib/email-content.ts resolves which).
 *
 * The copy is text, never HTML: it is escaped first, then given its bold and
 * paragraphs, then filled with values that are escaped on their own. A garage's
 * company name lands in a client's inbox, so no value is ever trusted as markup.
 *
 * Keep in step with `renderCopy` in infra/lambdas/new-request-broadcast and
 * infra/lambdas/appointment-completion-sweeper, which carry a copy of this.
 */
export function renderEmail(
  templateName: EmailTemplateName,
  variables: Record<string, string>,
  copy?: EmailCopy
): RenderedEmail {
  const definition = emailDefinition(templateName)
  if (!definition) {
    throw new Error(`Unknown email template: ${templateName}`)
  }
  return renderDefinition(definition, variables, copy || definition.copy)
}

export function renderDefinition(
  definition: EmailDefinition,
  variables: Record<string, string>,
  copy: EmailCopy
): RenderedEmail {
  const raw: Record<string, string> = {}
  for (const v of definition.variables) raw[v.token] = v.value(variables).trim()

  const fillText = (text: string) => text.replace(TOKEN_PATTERN, (_, token: string) => raw[token] ?? '')
  const fillHtml = (html: string) =>
    html.replace(TOKEN_PATTERN, (_, token: string) => escapeHtml(raw[token] ?? ''))
  // A paragraph that names a token with no value is left out.
  const present = (paragraph: string) =>
    [...paragraph.matchAll(TOKEN_PATTERN)].every(([, token]) => !!raw[token])

  const paragraphs = (text: string) =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && present(p))

  const subject = fillText(copy.subject).replace(/\s+/g, ' ').trim()
  const heading = fillText(copy.heading).trim()
  const body = paragraphs(copy.body)
  const note = paragraphs(copy.note)

  const ctaUrl = definition.ctaUrl && copy.ctaLabel.trim() ? escapeHtml(definition.ctaUrl(variables)) : undefined
  const ctaLabel = ctaUrl ? escapeHtml(copy.ctaLabel.trim()) : undefined

  const bodyHtml = [
    heading ? `<h2 style="margin:0 0 16px 0;font-size:20px;">${fillHtml(inline(escapeHtml(copy.heading.trim())))}</h2>` : '',
    ...body.map((p) => `<p>${fillHtml(inline(escapeHtml(p)))}</p>`),
  ].join('\n')
  const noteHtml = note
    .map((p) => `<p style="margin:20px 0 0 0;color:#6b7280;font-size:13px;">${fillHtml(inline(escapeHtml(p)))}</p>`)
    .join('\n')

  const html = baseLayout({ title: escapeHtml(subject), bodyHtml, ctaLabel, ctaUrl, noteHtml })

  // The plain-text part is written out, not stripped from the HTML: stripping
  // loses the paragraphs and the button's link.
  const plain = (p: string) => fillText(p).replace(/\*\*/g, '')
  const text = [
    heading ? plain(copy.heading.trim()) : '',
    ...body.map(plain),
    ctaUrl ? `${copy.ctaLabel.trim()}: ${definition.ctaUrl!(variables)}` : '',
    ...note.map(plain),
    'NextService',
  ]
    .filter(Boolean)
    .join('\n\n')

  return { subject, html, text, ctaUrl }
}

/** `**bold**` and single line breaks, on already-escaped text. */
function inline(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
