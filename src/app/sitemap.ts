import type { MetadataRoute } from 'next'
import { getAllOffers } from '@/lib/offers'
import { areas } from '@/data/locations'
import { SITE_URL } from '@/lib/site-url'

/**
 * Deployment date of the content on the static pages. Bump this when a page's
 * copy actually changes.
 *
 * Never use `new Date()` here: a sitemap that reports every URL as modified at
 * crawl time is telling Google the whole site changed on every visit, which
 * Google responds to by ignoring `lastModified` for the domain entirely.
 */
const CONTENT_LAST_MODIFIED = new Date('2026-08-11')

/**
 * Hot deals are edited through the admin panel, so `updatedAt` is only as
 * trustworthy as whatever wrote it. `new Date('not-a-date').toISOString()`
 * throws a RangeError, and Next serialises `lastModified` for every entry —
 * so one malformed record would take the entire sitemap down with a 500.
 */
function safeDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/locations/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/register-professional/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/faq/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/contact/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/privacy/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // `/login/` is intentionally absent — it's a utility page carrying `noindex`.

  const areaRoutes: MetadataRoute.Sitemap = areas.map((a) => ({
    url: `${SITE_URL}/location/${a.slug}/`,
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  let offerRoutes: MetadataRoute.Sitemap = []
  try {
    const offers = await getAllOffers()
    offerRoutes = offers.map((o) => ({
      url: `${SITE_URL}/offer/${o.slug}/`,
      lastModified: safeDate(o.updatedAt, CONTENT_LAST_MODIFIED),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    // If offer loading fails, keep sitemap valid with static routes only
  }

  return [...staticRoutes, ...areaRoutes, ...offerRoutes]
}
