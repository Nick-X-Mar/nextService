/**
 * Admin-editable content for the public marketing pages.
 *
 * The shape is a list of typed blocks rather than free HTML, for three
 * reasons: the pages keep rendering through the existing design-system
 * components instead of drifting into hand-written markup; an editor cannot
 * break a layout by mistake; and — since this text is written in an admin form
 * and then rendered on a public page, some of it into JSON-LD — there is never
 * any untrusted HTML to sanitize in the first place.
 *
 * Inline emphasis and links inside `text` fields use a deliberately tiny
 * markup subset parsed by `src/components/content/RichText.tsx`. See that file
 * for the grammar and the URL rules.
 */

/** Every block carries a stable id so the editor can reorder without remounting. */
interface BlockBase {
  id: string
}

/** A section title. Rendered as <h2>. */
export interface HeadingBlock extends BlockBase {
  type: 'heading'
  text: string
}

/** One or more paragraphs. A blank line starts a new paragraph. */
export interface ParagraphBlock extends BlockBase {
  type: 'paragraph'
  text: string
}

/** A bulleted list. */
export interface ListBlock extends BlockBase {
  type: 'list'
  items: string[]
}

/**
 * An accordion of questions. Also the source for the FAQ JSON-LD, so the
 * answers must stay plain enough to be meaningful without markup.
 */
export interface FaqBlock extends BlockBase {
  type: 'faq'
  /** Optional group heading, e.g. "Προσφορές και τιμές". */
  title?: string
  /** Material Symbols icon name for the group heading. */
  icon?: string
  items: { question: string; answer: string }[]
}

/** The icon + title + body grid used by "Πώς λειτουργεί" and the contact channels. */
export interface CardsBlock extends BlockBase {
  type: 'cards'
  items: { icon: string; title: string; body: string; href?: string }[]
}

/** A tinted notice, e.g. the draft banner on Όροι Χρήσης. */
export interface CalloutBlock extends BlockBase {
  type: 'callout'
  tone: 'info' | 'warning'
  text: string
}

/** A call-to-action button. */
export interface CtaBlock extends BlockBase {
  type: 'cta'
  label: string
  href: string
  variant: 'primary' | 'secondary'
}

/**
 * The area grid on /locations/.
 *
 * A placeholder rather than content: the grid is generated from the area
 * documents, but it still has to sit at a specific point in the page's block
 * flow so the copy above and below it stays editable and reorderable.
 */
export interface AreasBlock extends BlockBase {
  type: 'areas'
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | FaqBlock
  | CardsBlock
  | CalloutBlock
  | CtaBlock
  | AreasBlock

export type ContentBlockType = ContentBlock['type']

export const CONTENT_BLOCK_TYPES: ContentBlockType[] = [
  'heading',
  'paragraph',
  'list',
  'faq',
  'cards',
  'callout',
  'cta',
  'areas',
]

/** The page heading, which every one of these pages has in the same shape. */
export interface ContentHero {
  /** Leading part of the <h1>. */
  title: string
  /** Optional trailing part, rendered in the brand colour. */
  titleAccent?: string
  /** The standfirst under the heading. */
  lead?: string
}

/** The `<title>` and meta description. Feeds `generateMetadata`. */
export interface ContentMeta {
  title: string
  description: string
}

/** One editable page. */
export interface SitePage {
  pageKey: SitePageKey
  meta: ContentMeta
  hero: ContentHero
  blocks: ContentBlock[]
  updatedAt: string
  /** Admin email, for the audit line in the editor. */
  updatedBy?: string
}

export const SITE_PAGE_KEYS = [
  'about',
  'faq',
  'locations',
  'terms',
  'privacy',
  'contact',
  'home-faq',
] as const

export type SitePageKey = (typeof SITE_PAGE_KEYS)[number]

/** Greek labels for the admin page picker. */
export const SITE_PAGE_LABELS: Record<SitePageKey, { label: string; path: string }> = {
  about: { label: 'Σχετικά', path: '/about/' },
  faq: { label: 'Συχνές Ερωτήσεις', path: '/faq/' },
  locations: { label: 'Περιοχές', path: '/locations/' },
  terms: { label: 'Όροι Χρήσης', path: '/terms/' },
  privacy: { label: 'Πολιτική Απορρήτου', path: '/privacy/' },
  contact: { label: 'Επικοινωνία', path: '/contact/' },
  'home-faq': { label: 'Αρχική — Συχνές Ερωτήσεις', path: '/' },
}

export function isSitePageKey(value: unknown): value is SitePageKey {
  return typeof value === 'string' && (SITE_PAGE_KEYS as readonly string[]).includes(value)
}

/**
 * Per-area content for /location/[slug].
 *
 * `slug` is deliberately absent from everything the editor can change: these
 * slugs are inherited from the WordPress site and still carry its search
 * authority, and `next.config.ts` maps a set of legacy 301s onto them by hand.
 * Renaming one silently breaks both. See src/data/locations.ts.
 */
export interface AreaContent {
  slug: string
  name: string
  nameGenitive: string
  region: string
  coverage: 'active' | 'expanding'
  activeIn: string[]
  title: string
  description: string
  intro: string
  detail: string
  neighbourhoods: string[]
  commonServices: string[]
  faqs: { question: string; answer: string }[]
  updatedAt?: string
  updatedBy?: string
}

/** The DynamoDB partition key for an area document. */
export function areaContentKey(slug: string): string {
  return `area:${slug}`
}
