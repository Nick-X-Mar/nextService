import type { NextConfig } from "next";
import path from "path";

/**
 * 301s from the previous WordPress site.
 *
 * The old site's Yoast sitemaps listed 76 indexed URLs. Everything that has a
 * direct equivalent on the new app is served at its original URL instead of
 * being redirected — `/`, `/login/`, `/terms/`, `/locations/`, `/faq/`,
 * `/contact/`, the four `/location/*` area pages and the five preserved
 * `/offer/*` slugs. This map covers the remainder.
 *
 * Rules:
 *  - `source` is written WITHOUT a trailing slash. `trailingSlash: true`
 *    normalises the incoming path before these are matched.
 *  - Greek slugs are written in decoded form for readability, but Next.js
 *    matches `source` against the RAW, still-percent-encoded pathname — a
 *    decoded source never fires for the URLs Google actually holds. Every
 *    non-ASCII entry is therefore expanded into its encoded variants by
 *    `withEncodedVariants()` below. Verified by hitting each old URL in the
 *    exact form the Yoast sitemap published it.
 *  - Redirect to a topically related page, never blanket-to-homepage where a
 *    real equivalent exists — Google treats irrelevant mass redirects as soft
 *    404s and drops the equity anyway.
 *  - Deliberately NOT redirected: `/full-width/`, `/sidebar-left/`,
 *    `/sidebar-right/`, `/sample-page/`. Those are WordPress theme demo pages
 *    with no equivalent and no value; a 404 is the correct signal.
 */
const LEGACY_REDIRECTS: { source: string; destination: string }[] = [
  // ── WordPress pages ──────────────────────────────────────
  { source: "/popular", destination: "/" },
  { source: "/coupons", destination: "/" },
  { source: "/categories", destination: "/" },
  { source: "/deals", destination: "/" },
  { source: "/geo-home", destination: "/" },
  { source: "/search-page", destination: "/" },
  { source: "/newsletter", destination: "/" },
  // Destination is /login/ rather than /forgot-password/ on purpose: the latter
  // is Disallow-ed in robots.txt, so equity redirected there would dead-end at a
  // URL Google can't crawl.
  { source: "/recover", destination: "/login/" },
  { source: "/profile", destination: "/login/" },
  // The only registration page on the new app is the garage one. Client
  // registration now happens inside the request flow and has no landing page.
  { source: "/register", destination: "/register-professional/" },
  { source: "/stores", destination: "/locations/" },

  // ── Offers that no longer exist ──────────────────────────
  { source: "/offer/megalo-service-autokinitou", destination: "/offer/service-auto/" },
  { source: "/offer/allagi-ladion-autokinitou", destination: "/offer/service-auto/" },
  { source: "/offer/service-smart", destination: "/offer/service-auto/" },
  { source: "/offer/auto-service-smart-diesel", destination: "/offer/service-auto/" },
  { source: "/offer/gyalisma-auto", destination: "/" },
  { source: "/offer/aisthitires-parkarismatos", destination: "/" },
  {
    source: "/offer/αντικατάσταση-ενός-σετ-ιμάντα-χρονισ",
    destination: "/offer/set-imantas-xronismou/",
  },
  { source: "/offer/αλλαγή-λαδιών-στον-χώρο-σας", destination: "/offer/service-auto/" },
  {
    source: "/offer/στο-χώρο-σας-100e-service-αυτοκινήτου-με-εργασία",
    destination: "/offer/service-auto/",
  },
  { source: "/offer/60e-εργασία-και-ανταλλακτικάτο-ένα-ζευγ", destination: "/" },
  { source: "/offer/160e-εργασία-και-ανταλλακτικά-για-αντικα", destination: "/" },
  { source: "/offer/vstrom-service-μοτοσυκλετας", destination: "/" },

  // ── Offer categories ─────────────────────────────────────
  { source: "/offer_cat/auto-service", destination: "/offer/service-auto/" },
  { source: "/offer_cat/αλλαγή-λαδιών", destination: "/offer/service-auto/" },
  { source: "/offer_cat/takakia", destination: "/offer/service-auto/" },
  { source: "/offer_cat/disk", destination: "/offer/set_disk_all_cars/" },
  { source: "/offer_cat/imantas-xronismou", destination: "/offer/set-imantas-xronismou/" },
  { source: "/offer_cat/meriki-vafi", destination: "/offer/vafi-profylaktira-portas/" },
  { source: "/offer_cat/ολική-βαφή", destination: "/offer/vafi-oliki/" },
  { source: "/offer_cat/automotive", destination: "/" },
  { source: "/offer_cat/service-moto", destination: "/" },
  { source: "/offer_cat/moto", destination: "/" },
  { source: "/offer_cat/aisthitires-parking", destination: "/" },
  { source: "/offer_cat/γυάλισμα-αυτοκινήτου", destination: "/" },

  // ── Offer tags ───────────────────────────────────────────
  { source: "/offer_tag/auto-service", destination: "/offer/service-auto/" },
  { source: "/offer_tag/smart-service", destination: "/offer/service-auto/" },
  { source: "/offer_tag/vafi-tmimatos-auto", destination: "/offer/vafi-profylaktira-portas/" },
  { source: "/offer_tag/oliki-vafi-auto", destination: "/offer/vafi-oliki/" },
  { source: "/offer_tag/smart", destination: "/" },
  { source: "/offer_tag/γυάλισμα-αυτοκινήτου", destination: "/" },

  // ── Garage profiles → the area page that covers them ─────
  // There is no public garage profile page on the new app, and the old listings
  // are stale. The area page is the closest topical match, which keeps these
  // out of soft-404 territory.
  { source: "/store/auto-marousi", destination: "/location/north-athens/" },
  { source: "/store/fanopoieiomarousi", destination: "/location/north-athens/" },
  { source: "/store/metamorfosi", destination: "/location/north-athens/" },
  { source: "/store/fanopoieio-metamorfosi", destination: "/location/north-athens/" },
  { source: "/store/honda-mesogeivn", destination: "/location/north-athens/" },
  { source: "/store/mosxato", destination: "/location/notia-proastia/" },
  { source: "/store/agios-dimitrios", destination: "/location/notia-proastia/" },
  { source: "/store/synergeio-peristeri", destination: "/location/dititka-proastia/" },
  { source: "/store/συνεργείο-στο-κερατσίνι", destination: "/location/peiraias/" },
  { source: "/store/service-παγκράτι", destination: "/location/athens-center/" },
  // Area unknown from the slug — send to the areas index rather than guessing.
  { source: "/store/george-force", destination: "/locations/" },
  { source: "/store/motonkosmos", destination: "/locations/" },

  // ── The old "letter" taxonomy duplicated /location/* ──────
  { source: "/letter/voria-athens", destination: "/location/north-athens/" },
  { source: "/letter/ditika-athens", destination: "/location/dititka-proastia/" },
  { source: "/letter/kentro-athens", destination: "/location/athens-center/" },
  { source: "/letter/notia-athens", destination: "/location/notia-proastia/" },

  // ── Yoast sitemap index ──────────────────────────────────
  // Google already knows this URL; keep it pointing at the real sitemap so the
  // known entry point doesn't 404 while Search Console catches up.
  { source: "/sitemap_index.xml", destination: "/sitemap.xml" },
];

/**
 * Expands every non-ASCII `source` into the percent-encoded forms a crawler
 * will actually request.
 *
 * WordPress published these slugs lowercase-encoded (`%ce%b1`), which is what
 * Google has in its index, while `encodeURIComponent` emits uppercase
 * (`%CE%B1`) — the form a browser produces when someone types or pastes the
 * Greek URL. Both are emitted, plus the decoded original, so the redirect fires
 * whichever way the request arrives.
 */
function withEncodedVariants(
  list: { source: string; destination: string }[]
): { source: string; destination: string }[] {
  const out: { source: string; destination: string }[] = []
  const seen = new Set<string>()

  const push = (r: { source: string; destination: string }) => {
    if (seen.has(r.source)) return
    seen.add(r.source)
    out.push(r)
  }

  for (const r of list) {
    push(r)
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]*$/.test(r.source)) continue

    const upper = r.source.split("/").map(encodeURIComponent).join("/")
    const lower = upper.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())
    push({ ...r, source: upper })
    push({ ...r, source: lower })
  }

  return out
}

/**
 * Content-Security-Policy.
 *
 * `script-src` has to include 'unsafe-inline': Next.js emits inline bootstrap
 * and RSC-flight scripts on every page, and the only alternative — per-request
 * nonces — forces every route to render dynamically, which would throw away the
 * static generation the whole SEO setup depends on. So this policy is not an
 * XSS killswitch.
 *
 * It still buys real protection that nothing else here provides: an injected
 * script cannot load code from an attacker's host, `frame-ancestors` blocks
 * clickjacking, `base-uri` blocks <base> hijacking of every relative URL, and
 * `form-action` stops an injected form from posting credentials off-site.
 *
 * Hosts allowed, and why:
 *  - fonts.googleapis.com / fonts.gstatic.com — the Inter and Material Symbols
 *    @import in globals.css
 *  - js.stripe.com / api.stripe.com / hooks.stripe.com — Stripe.js and its
 *    payment frames, loaded by lib/stripe-client.ts
 *  - *.amazonaws.com — S3 photo uploads (images) and AppSync (wss for chat)
 */
const isProd = process.env.NODE_ENV === 'production'

const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' is development-only: Next's Fast Refresh runtime evaluates
  // strings, and without it hot reloading dies with an EvalError on every page
  // load. The production bundle never evals, so it stays out of the real policy.
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.amazonaws.com",
  "connect-src 'self' https://*.amazonaws.com wss://*.amazonaws.com https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Production only. This directive rewrites every http:// subresource request
  // to https://, which on a plain-http dev server turns every API call into
  // https://localhost:3000 and fails with ERR_SSL_PROTOCOL_ERROR — the app
  // loads but nothing fetches.
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ')

const nextConfig: NextConfig = {
  trailingSlash: true,
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.s3.eu-central-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
    ],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.yaml$/,
      use: 'yaml-loader',
    });

    // Ensure proper path resolution for @/ aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };

    return config;
  },
  // Expose environment variables to the runtime
  // NOTE: Only server-side vars here. STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
  // are intentionally excluded — they are available via process.env on server only.
  env: {
    REGION: process.env.REGION,
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    AMPLIFY_ROLE_ARN: process.env.AMPLIFY_ROLE_ARN,
    NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_WEBSOCKET_ENDPOINT,
    NEXT_PUBLIC_APPSYNC_API_KEY: process.env.NEXT_PUBLIC_APPSYNC_API_KEY,
    NEXT_PUBLIC_APPSYNC_REGION: process.env.NEXT_PUBLIC_APPSYNC_REGION,
    NEXT_PUBLIC_APPSYNC_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT,
    NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT: process.env.NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT,
    DEPOSIT_PERCENT: process.env.DEPOSIT_PERCENT,
    CANCELLATION_DEADLINE_DAYS: process.env.CANCELLATION_DEADLINE_DAYS,
    // Amplify Hosting quirk: app-level env vars are only available at build
    // time. Listing them here inlines them into the SSR bundle so they work
    // at runtime too. Never reference these from client code.
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    // Signs the short-lived tokens the browser presents to AppSync, and that
    // the AppSync Lambda authorizer verifies. Must match the value set on the
    // nextservice-appsync-authorizer function.
    REALTIME_JWT_SECRET: process.env.REALTIME_JWT_SECRET,
    SESSION_EXPIRY: process.env.SESSION_EXPIRY,
    ADMIN_SESSION_EXPIRY: process.env.ADMIN_SESSION_EXPIRY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED,
    SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS,
    SES_REGION: process.env.SES_REGION,
    SES_CONFIG_SET: process.env.SES_CONFIG_SET,
    SITE_URL: process.env.SITE_URL,
  },
  async redirects() {
    return withEncodedVariants(LEGACY_REDIRECTS).map((r) => ({ ...r, permanent: true }))
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
};

export default nextConfig;
