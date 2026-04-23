import type { MetadataRoute } from 'next'
import { getAllOffers } from '@/lib/offers'
import { SITE_URL } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/register-professional/`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/login/`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy/`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms/`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  let offerRoutes: MetadataRoute.Sitemap = []
  try {
    const offers = await getAllOffers()
    offerRoutes = offers.map((o) => ({
      url: `${SITE_URL}/offer/${o.slug}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    // If offer loading fails, keep sitemap valid with static routes only
  }

  return [...staticRoutes, ...offerRoutes]
}
