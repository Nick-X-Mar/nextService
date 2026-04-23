// Base URL for canonical, OG, sitemap, robots and JSON-LD.
//
// Set `SITE_URL` in the Amplify env for each environment:
//   - dev:  https://dev.d3ku6yajf4j6y8.amplifyapp.com
//   - prod: https://www.nextservice.gr
//
// Falls back to the prod domain so production keeps working if the var is
// ever missing. Server-only — never leak to client bundles.
export const SITE_URL = (process.env.SITE_URL || 'https://www.nextservice.gr').replace(/\/$/, '')
