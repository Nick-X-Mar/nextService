// Base URL for canonical, OG, sitemap, robots and JSON-LD.
//
// Set `SITE_URL` in the Amplify env for each environment:
//   - dev:  https://dev.d3ku6yajf4j6y8.amplifyapp.com
//   - prod: https://www.nextservice.gr
//
// Falls back to the prod domain so production keeps working if the var is
// ever missing. Server-only — never leak to client bundles.
export const SITE_URL = (process.env.SITE_URL || 'https://www.nextservice.gr').replace(/\/$/, '')

// Only the real domain is indexed. Staging and production both also answer on
// their *.amplifyapp.com hosts, and until the domain cutover production runs on
// one — left indexable, Google and the AI crawlers index those as duplicates
// that compete with www.nextservice.gr. Indexing turns on by itself once
// SITE_URL is the domain.
export const IS_INDEXABLE = /(^|\.)nextservice\.gr$/.test(new URL(SITE_URL).hostname)
