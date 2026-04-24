import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

const disallowPrivate = [
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
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: disallowPrivate,
      },
      // AI search & assistant crawlers — explicitly allowed so the site can be
      // surfaced and cited in AI Overviews / ChatGPT / Claude / Perplexity / Gemini.
      {
        userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User'],
        allow: '/',
        disallow: disallowPrivate,
      },
      {
        userAgent: ['ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Claude-SearchBot', 'Claude-User'],
        allow: '/',
        disallow: disallowPrivate,
      },
      {
        userAgent: ['PerplexityBot', 'Perplexity-User'],
        allow: '/',
        disallow: disallowPrivate,
      },
      {
        userAgent: ['Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'Meta-ExternalAgent'],
        allow: '/',
        disallow: disallowPrivate,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
