import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/garage-dashboard',
          '/garage-dashboard/',
          '/requests',
          '/requests/',
          '/profile',
          '/profile/',
          '/car-details',
          '/car-specifications',
          '/reset-password/',
          '/forgot-password',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
