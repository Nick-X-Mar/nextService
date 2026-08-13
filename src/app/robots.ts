import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

// Crawl-budget control for authenticated app areas. Every one of these also
// carries `robots: { index: false, follow: false }` on its layout, so the
// Disallow is defence in depth rather than the primary control.
//
// NOTE: `/profile` is deliberately NOT listed. It is a legacy URL from the old
// site that now 301s to /login/ — a Disallow would stop Google from ever
// reading that redirect, stranding the URL's authority. The same reasoning
// applies to any path added to the redirect map in next.config.ts: a redirect
// source must stay crawlable.
const disallowPrivate = [
  '/admin',
  '/admin/',
  '/garage-dashboard',
  '/garage-dashboard/',
  '/requests',
  '/requests/',
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
