import {
  CONTENT_BLOCK_TYPES,
  isSitePageKey,
  type AreaContent,
  type ContentBlock,
  type SitePage,
} from '@/types/siteContent'

/**
 * Server-side validation for admin-authored content.
 *
 * The admin UI is not the boundary — this is. Everything below is checked on
 * the way in rather than on the way out, because the way out is a public page
 * and, for some fields, a JSON-LD block.
 *
 * The limits are not cosmetic either: a DynamoDB item caps at 400KB, and a
 * page document that exceeds it fails the write *after* the editor thinks it
 * saved. Bounding each field and the whole document keeps that impossible.
 */

export class ContentValidationError extends Error {}

const MAX_DOCUMENT_BYTES = 300_000
const MAX_BLOCKS = 120

const LIMITS = {
  metaTitle: 200,
  metaDescription: 500,
  heroTitle: 200,
  heroAccent: 120,
  heroLead: 1500,
  heading: 300,
  paragraph: 6000,
  listItems: 60,
  listItem: 1500,
  faqItems: 60,
  question: 500,
  answer: 4000,
  cardItems: 24,
  cardTitle: 200,
  cardBody: 2000,
  icon: 60,
  ctaLabel: 80,
  href: 500,
  blockId: 120,
  areaListItems: 80,
  areaListItem: 200,
  areaText: 4000,
}

function fail(message: string): never {
  throw new ContentValidationError(message)
}

function str(value: unknown, field: string, max: number, { required = true } = {}): string {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`Το πεδίο «${field}» είναι υποχρεωτικό.`)
    return ''
  }
  if (typeof value !== 'string') fail(`Το πεδίο «${field}» πρέπει να είναι κείμενο.`)
  const trimmed = value.trim()
  if (trimmed.length > max) {
    fail(`Το πεδίο «${field}» ξεπερνά τους ${max} χαρακτήρες.`)
  }
  return trimmed
}

function strList(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) fail(`Το πεδίο «${field}» πρέπει να είναι λίστα.`)
  if (value.length > maxItems) fail(`Η λίστα «${field}» ξεπερνά τα ${maxItems} στοιχεία.`)
  return value.map((item, i) => str(item, `${field}[${i}]`, maxLen))
}

/**
 * The same scheme allowlist the renderer applies to inline links.
 *
 * A CTA href is written straight into an `href`, so `javascript:` here would
 * be a stored XSS with an admin as the author. Rejecting at save time makes
 * the mistake visible instead of silently inert on the page.
 */
export function isSafeHref(raw: string): boolean {
  const href = raw.trim()
  if (!href) return false
  if (href.startsWith('//')) return false
  if (href.startsWith('/')) return true
  return /^(https?:\/\/|mailto:|tel:)/i.test(href)
}

function validateBlock(raw: unknown, index: number): ContentBlock {
  if (!raw || typeof raw !== 'object') fail(`Το μπλοκ #${index + 1} δεν είναι έγκυρο.`)
  const block = raw as Record<string, unknown>
  const type = block.type

  if (typeof type !== 'string' || !(CONTENT_BLOCK_TYPES as string[]).includes(type)) {
    fail(`Άγνωστος τύπος μπλοκ στη θέση #${index + 1}.`)
  }
  const id = str(block.id, `μπλοκ #${index + 1} id`, LIMITS.blockId)

  switch (type) {
    case 'heading':
      return { id, type, text: str(block.text, 'τίτλος ενότητας', LIMITS.heading) }

    case 'paragraph':
      return { id, type, text: str(block.text, 'παράγραφος', LIMITS.paragraph) }

    case 'list':
      return { id, type, items: strList(block.items, 'λίστα', LIMITS.listItems, LIMITS.listItem) }

    case 'faq': {
      if (!Array.isArray(block.items)) fail('Οι ερωτήσεις πρέπει να είναι λίστα.')
      if (block.items.length > LIMITS.faqItems) {
        fail(`Οι ερωτήσεις ξεπερνούν τις ${LIMITS.faqItems}.`)
      }
      return {
        id,
        type,
        ...(block.title ? { title: str(block.title, 'τίτλος ομάδας', LIMITS.heading) } : {}),
        ...(block.icon ? { icon: str(block.icon, 'εικονίδιο', LIMITS.icon) } : {}),
        items: block.items.map((item, i) => {
          const entry = (item || {}) as Record<string, unknown>
          return {
            question: str(entry.question, `ερώτηση #${i + 1}`, LIMITS.question),
            answer: str(entry.answer, `απάντηση #${i + 1}`, LIMITS.answer),
          }
        }),
      }
    }

    case 'cards': {
      if (!Array.isArray(block.items)) fail('Οι κάρτες πρέπει να είναι λίστα.')
      if (block.items.length > LIMITS.cardItems) {
        fail(`Οι κάρτες ξεπερνούν τις ${LIMITS.cardItems}.`)
      }
      return {
        id,
        type,
        items: block.items.map((item, i) => {
          const entry = (item || {}) as Record<string, unknown>
          const href = entry.href ? str(entry.href, `κάρτα #${i + 1} σύνδεσμος`, LIMITS.href) : ''
          if (href && !isSafeHref(href)) {
            fail(`Ο σύνδεσμος στην κάρτα #${i + 1} δεν επιτρέπεται.`)
          }
          return {
            icon: str(entry.icon, `κάρτα #${i + 1} εικονίδιο`, LIMITS.icon, { required: false }),
            title: str(entry.title, `κάρτα #${i + 1} τίτλος`, LIMITS.cardTitle),
            body: str(entry.body, `κάρτα #${i + 1} κείμενο`, LIMITS.cardBody),
            ...(href ? { href } : {}),
          }
        }),
      }
    }

    case 'callout': {
      const tone = block.tone === 'warning' ? 'warning' : 'info'
      return { id, type, tone, text: str(block.text, 'σημείωση', LIMITS.paragraph) }
    }

    case 'cta': {
      const href = str(block.href, 'σύνδεσμος κουμπιού', LIMITS.href)
      if (!isSafeHref(href)) fail('Ο σύνδεσμος του κουμπιού δεν επιτρέπεται.')
      return {
        id,
        type,
        label: str(block.label, 'κείμενο κουμπιού', LIMITS.ctaLabel),
        href,
        variant: block.variant === 'secondary' ? 'secondary' : 'primary',
      }
    }

    case 'areas':
      return { id, type }

    default:
      fail(`Άγνωστος τύπος μπλοκ στη θέση #${index + 1}.`)
  }
}

function assertSize(document: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(document), 'utf-8')
  if (bytes > MAX_DOCUMENT_BYTES) {
    fail(`Το περιεχόμενο είναι πολύ μεγάλο (${Math.round(bytes / 1024)}KB). Όριο ${MAX_DOCUMENT_BYTES / 1024}KB.`)
  }
}

/** Validates and normalises a page document submitted by the admin editor. */
export function validateSitePage(raw: unknown, updatedBy: string): SitePage {
  if (!raw || typeof raw !== 'object') fail('Μη έγκυρο περιεχόμενο.')
  const input = raw as Record<string, unknown>

  if (!isSitePageKey(input.pageKey)) fail('Άγνωστη σελίδα.')

  const meta = (input.meta || {}) as Record<string, unknown>
  const hero = (input.hero || {}) as Record<string, unknown>

  if (!Array.isArray(input.blocks)) fail('Τα μπλοκ πρέπει να είναι λίστα.')
  if (input.blocks.length > MAX_BLOCKS) fail(`Τα μπλοκ ξεπερνούν τα ${MAX_BLOCKS}.`)

  const seenIds = new Set<string>()
  const blocks = input.blocks.map((block, i) => {
    const validated = validateBlock(block, i)
    // Ids key React lists and the editor's own reordering; a duplicate makes
    // both behave unpredictably.
    if (seenIds.has(validated.id)) fail(`Διπλό id μπλοκ: «${validated.id}».`)
    seenIds.add(validated.id)
    return validated
  })

  const page: SitePage = {
    pageKey: input.pageKey,
    meta: {
      title: str(meta.title, 'τίτλος SEO', LIMITS.metaTitle),
      description: str(meta.description, 'περιγραφή SEO', LIMITS.metaDescription, {
        required: false,
      }),
    },
    hero: {
      title: str(hero.title, 'επικεφαλίδα', LIMITS.heroTitle, { required: false }),
      ...(hero.titleAccent
        ? { titleAccent: str(hero.titleAccent, 'τονισμένη επικεφαλίδα', LIMITS.heroAccent) }
        : {}),
      ...(hero.lead ? { lead: str(hero.lead, 'εισαγωγή', LIMITS.heroLead) } : {}),
    },
    blocks,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }

  if (!page.hero.title && !page.hero.titleAccent) {
    fail('Η σελίδα χρειάζεται επικεφαλίδα.')
  }

  assertSize(page)
  return page
}

/**
 * Validates an area document.
 *
 * `slug` is taken from the route, never from the body: these slugs are
 * inherited from the WordPress site, still carry its search authority, and are
 * the targets of the legacy 301 map in next.config.ts. Letting an editor
 * rename one would break both silently.
 */
export function validateAreaContent(raw: unknown, slug: string, updatedBy: string): AreaContent {
  if (!raw || typeof raw !== 'object') fail('Μη έγκυρο περιεχόμενο.')
  const input = raw as Record<string, unknown>

  if (!Array.isArray(input.faqs)) fail('Οι ερωτήσεις πρέπει να είναι λίστα.')
  if (input.faqs.length > LIMITS.faqItems) fail(`Οι ερωτήσεις ξεπερνούν τις ${LIMITS.faqItems}.`)

  const area: AreaContent = {
    slug,
    name: str(input.name, 'όνομα περιοχής', LIMITS.cardTitle),
    nameGenitive: str(input.nameGenitive, 'γενική περιοχής', LIMITS.cardTitle),
    region: str(input.region, 'νομός', LIMITS.cardTitle),
    coverage: input.coverage === 'active' ? 'active' : 'expanding',
    activeIn: strList(input.activeIn, 'ενεργές περιοχές', LIMITS.areaListItems, LIMITS.areaListItem),
    title: str(input.title, 'τίτλος SEO', LIMITS.metaTitle),
    description: str(input.description, 'περιγραφή SEO', LIMITS.metaDescription),
    intro: str(input.intro, 'εισαγωγή', LIMITS.areaText),
    detail: str(input.detail, 'κείμενο', LIMITS.areaText),
    neighbourhoods: strList(
      input.neighbourhoods,
      'γειτονιές',
      LIMITS.areaListItems,
      LIMITS.areaListItem
    ),
    commonServices: strList(
      input.commonServices,
      'συνήθεις εργασίες',
      LIMITS.areaListItems,
      LIMITS.areaListItem
    ),
    faqs: input.faqs.map((item, i) => {
      const entry = (item || {}) as Record<string, unknown>
      return {
        question: str(entry.question, `ερώτηση #${i + 1}`, LIMITS.question),
        answer: str(entry.answer, `απάντηση #${i + 1}`, LIMITS.answer),
      }
    }),
    updatedAt: new Date().toISOString(),
    updatedBy,
  }

  assertSize(area)
  return area
}
