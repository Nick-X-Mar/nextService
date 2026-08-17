/**
 * Shared JSON-LD builders.
 *
 * Every crawlable page emits exactly one `<script type="application/ld+json">`
 * holding a `@graph`: the Organization and WebSite nodes plus whatever
 * page-specific types apply. Use `graphJsonLd()` — see the note on it for why
 * a second script tag on the same page is not an option.
 *
 * AI search engines lean heavily on `sameAs` to resolve the brand to a single
 * entity, and on `dateModified` for recency — both are included deliberately.
 */
import { SITE_URL } from '@/lib/site-url'

/** Stable identifier for the publisher entity, referenced from other nodes. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

export const CONTACT_EMAIL = 'info@nextservice.gr'

/**
 * Public profiles that belong to NextService. These are what tie the site to a
 * knowledge-graph entity — a `sameAs` pointing at a profile that doesn't exist
 * is worse than no `sameAs` at all, so only add a URL once it's confirmed live.
 * Mirrors the links in `components/layout/Footer.tsx`.
 *
 * TODO: add Instagram / LinkedIn / Google Business Profile here as they go live.
 */
export const SOCIAL_PROFILES: string[] = [
  'https://facebook.com/nextservice.gr',
]

export const organizationNode = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'NextService',
  alternateName: 'NextService.gr',
  url: `${SITE_URL}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/logo.png`,
  },
  image: `${SITE_URL}/opengraph-image/`,
  description:
    'Πλατφόρμα συνεργείων αυτοκινήτου. Οι ιδιοκτήτες οχημάτων στέλνουν αίτημα service και λαμβάνουν προσφορές από επαγγελματικά συνεργεία της περιοχής τους. Προς το παρόν καλύπτουμε την Αθήνα.',
  areaServed: { '@type': 'Country', name: 'GR' },
  sameAs: SOCIAL_PROFILES,
  contactPoint: {
    '@type': 'ContactPoint',
    email: CONTACT_EMAIL,
    contactType: 'customer support',
    areaServed: 'GR',
    availableLanguage: ['Greek', 'English'],
  },
}

export const websiteNode = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: 'NextService',
  url: `${SITE_URL}/`,
  inLanguage: 'el-GR',
  publisher: { '@id': ORGANIZATION_ID },
}

/**
 * Wraps page-specific nodes into a single `@graph` alongside the site-wide
 * publisher entity.
 *
 * Emitting ONE script per page is not just tidier — it's required. A page that
 * renders two separate `<script type="application/ld+json">` elements (one from
 * the layout, one from the page) only keeps the first as a real DOM tag when
 * the route is statically prerendered; the second survives only inside the RSC
 * flight payload. Googlebot executes JS and would eventually recover it, but
 * GPTBot, ClaudeBot and PerplexityBot do not — the markup would be invisible to
 * exactly the crawlers it's aimed at. Never add a second ld+json script to a
 * page; add the node here instead.
 */
export function graphJsonLd(nodes: Record<string, unknown>[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode,
      websiteNode,
      // Strip any per-node @context — inside a @graph the outer one applies.
      ...nodes.map(({ '@context': _ctx, ...rest }) => rest),
    ],
  }
}

export interface Crumb {
  name: string
  /** Absolute URL, with trailing slash */
  url: string
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  }
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@type': 'FAQPage',
    inLanguage: 'el-GR',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
}

/**
 * Renders one or more JSON-LD nodes as a single script tag.
 *
 * `JSON.stringify` does NOT escape `<`, so a value containing `</script>`
 * closes the block early and anything after it is parsed as live markup. Offer
 * titles and descriptions reach here straight from the HotDeals table, which
 * the admin panel writes — a compromised or careless admin account would
 * otherwise get stored XSS on every visitor to the offer page.
 *
 * `<` and `>` are escaped to their JSON unicode form, which is still valid JSON
 * and decodes back to the original characters, so consumers see the real text.
 * U+2028/U+2029 are escaped too: they are legal in JSON but terminate a
 * JavaScript line, which breaks parsers that eval the block.
 */
const HTML_UNSAFE = /[<>\u2028\u2029]/g
const HTML_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export function jsonLdScript(data: unknown) {
  const json = JSON.stringify(data).replace(HTML_UNSAFE, (c) => HTML_ESCAPES[c])
  return {
    type: 'application/ld+json' as const,
    dangerouslySetInnerHTML: { __html: json },
  }
}
