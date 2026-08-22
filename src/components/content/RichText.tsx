import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'

/**
 * Renders the tiny inline markup used by admin-authored page copy.
 *
 * The grammar is deliberately minuscule:
 *   **bold**        → <strong>
 *   *italic*        → <em>
 *   [label](href)   → <a> / <Link>, href validated below
 *   blank line      → a new paragraph
 *
 * Everything else is literal text. The point is that this content is written
 * in an admin form and rendered onto public pages — some of it also into
 * JSON-LD — so there must never be a moment where it is treated as HTML.
 * Nothing here calls `dangerouslySetInnerHTML`; the parser emits React
 * elements and React escapes the text nodes for us. That is also why the app
 * needs no HTML sanitizer dependency.
 */

/**
 * Schemes an editor is allowed to link to.
 *
 * A link is the one place a content field turns into something the browser
 * will act on, so anything not on this list — `javascript:`, `data:`,
 * `vbscript:` — is rendered as plain text rather than silently dropped, so a
 * mistake is visible in preview instead of invisible in production.
 */
function safeHref(raw: string): { href: string; external: boolean } | null {
  const href = raw.trim()
  if (!href) return null

  // Site-relative. `//evil.com` is protocol-relative, not site-relative.
  if (href.startsWith('/') && !href.startsWith('//')) {
    return { href, external: false }
  }
  if (/^(mailto:|tel:)/i.test(href)) {
    return { href, external: false }
  }
  if (/^https?:\/\//i.test(href)) {
    return { href, external: true }
  }
  return null
}

// Ordered so the two-asterisk form is tried before the one-asterisk form.
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]\n]+\]\([^)\s]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  INLINE.lastIndex = 0
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${i++}`

    if (token.startsWith('**')) {
      out.push(<strong key={key} className="font-bold text-on-surface">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else {
      const split = token.indexOf('](')
      const label = token.slice(1, split)
      const target = safeHref(token.slice(split + 2, -1))
      if (!target) {
        // Unsupported scheme: show the author's text, not a live link.
        out.push(<Fragment key={key}>{label}</Fragment>)
      } else if (target.external) {
        out.push(
          <a
            key={key}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline"
          >
            {label}
          </a>
        )
      } else {
        out.push(
          <Link key={key} href={target.href} className="text-primary font-medium hover:underline">
            {label}
          </Link>
        )
      }
    }
    last = match.index + token.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Inline markup only — no paragraph splitting. For headings, labels, list items. */
export function RichLine({ text }: { text: string }) {
  return <>{renderInline(text, 'l')}</>
}

/**
 * Full block of copy: blank-line-separated paragraphs, each with inline
 * markup. `className` styles each paragraph so callers keep control of the
 * type ramp.
 */
export default function RichText({
  text,
  className = 'text-base text-secondary leading-relaxed',
}: {
  text: string
  className?: string
}) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null

  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i > 0 ? `${className} mt-4` : className}>
          {renderInline(paragraph, `p${i}`)}
        </p>
      ))}
    </>
  )
}

/**
 * Strips markup down to readable plain text.
 *
 * Used for meta descriptions and JSON-LD, where `**bold**` would leak literal
 * asterisks into a search result.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
