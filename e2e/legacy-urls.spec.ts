import { test, expect } from '@playwright/test'

/**
 * Every URL the old WordPress site listed in its Yoast sitemaps (76, fetched from
 * www.nextservice.gr on 2026-10-30) — what Google holds for the domain. Each one must
 * keep working after the cutover: served at the same address, or one permanent
 * redirect to its closest page. Greek paths are written percent-encoded, as WordPress
 * published them and as crawlers request them; Next matches redirects on the raw path.
 * The map itself is `LEGACY_REDIRECTS` in next.config.ts.
 */

/** Pages the new site serves at the very same URL. */
const SERVED_AS_IS = [
  '/',
  '/locations/',
  '/login/',
  '/terms/',
  '/contact/',
  '/faq/',
  '/offer/service-auto/',
  '/offer/set-imantas-xronismou/',
  '/offer/set_disk_all_cars/',
  '/offer/vafi-oliki/',
  '/offer/vafi-profylaktira-portas/',
  '/location/north-athens/',
  '/location/dititka-proastia/',
  '/location/athens-center/',
  '/location/notia-proastia/',
]

/** Old URL → the one page it now redirects to. */
const REDIRECTED: [string, string][] = [
  ['/popular/', '/'],
  ['/coupons/', '/'],
  ['/categories/', '/'],
  ['/recover/', '/login/'],
  ['/geo-home/', '/'],
  ['/stores/', '/locations/'],
  ['/profile/', '/login/'],
  ['/register/', '/register-professional/'],
  ['/search-page/', '/'],
  ['/newsletter/', '/'],
  ['/deals/', '/'],
  ['/offer/gyalisma-auto/', '/'],
  ['/offer/megalo-service-autokinitou/', '/offer/service-auto/'],
  ['/offer/%ce%b1%ce%bd%cf%84%ce%b9%ce%ba%ce%b1%cf%84%ce%ac%cf%83%cf%84%ce%b1%cf%83%ce%b7-%ce%b5%ce%bd%cf%8c%cf%82-%cf%83%ce%b5%cf%84-%ce%b9%ce%bc%ce%ac%ce%bd%cf%84%ce%b1-%cf%87%cf%81%ce%bf%ce%bd%ce%b9%cf%83/', '/offer/set-imantas-xronismou/'],
  ['/offer/auto-service-smart-diesel/', '/offer/service-auto/'],
  ['/offer/aisthitires-parkarismatos/', '/'],
  ['/offer/%ce%b1%ce%bb%ce%bb%ce%b1%ce%b3%ce%ae-%ce%bb%ce%b1%ce%b4%ce%b9%cf%8e%ce%bd-%cf%83%cf%84%ce%bf%ce%bd-%cf%87%cf%8e%cf%81%ce%bf-%cf%83%ce%b1%cf%82/', '/offer/service-auto/'],
  ['/offer/%cf%83%cf%84%ce%bf-%cf%87%cf%8e%cf%81%ce%bf-%cf%83%ce%b1%cf%82-100e-service-%ce%b1%cf%85%cf%84%ce%bf%ce%ba%ce%b9%ce%bd%ce%ae%cf%84%ce%bf%cf%85-%ce%bc%ce%b5-%ce%b5%cf%81%ce%b3%ce%b1%cf%83%ce%af%ce%b1/', '/offer/service-auto/'],
  ['/offer/60e-%ce%b5%cf%81%ce%b3%ce%b1%cf%83%ce%af%ce%b1-%ce%ba%ce%b1%ce%b9-%ce%b1%ce%bd%cf%84%ce%b1%ce%bb%ce%bb%ce%b1%ce%ba%cf%84%ce%b9%ce%ba%ce%ac%cf%84%ce%bf-%ce%ad%ce%bd%ce%b1-%ce%b6%ce%b5%cf%85%ce%b3/', '/'],
  ['/offer/vstrom-service-%ce%bc%ce%bf%cf%84%ce%bf%cf%83%cf%85%ce%ba%ce%bb%ce%b5%cf%84%ce%b1%cf%82/', '/'],
  ['/offer/160e-%ce%b5%cf%81%ce%b3%ce%b1%cf%83%ce%af%ce%b1-%ce%ba%ce%b1%ce%b9-%ce%b1%ce%bd%cf%84%ce%b1%ce%bb%ce%bb%ce%b1%ce%ba%cf%84%ce%b9%ce%ba%ce%ac-%ce%b3%ce%b9%ce%b1-%ce%b1%ce%bd%cf%84%ce%b9%ce%ba%ce%b1/', '/'],
  ['/offer/service-smart/', '/offer/service-auto/'],
  ['/offer/allagi-ladion-autokinitou/', '/offer/service-auto/'],
  ['/store/mosxato/', '/location/notia-proastia/'],
  ['/store/honda-mesogeivn/', '/location/north-athens/'],
  ['/store/metamorfosi/', '/location/north-athens/'],
  ['/store/auto-marousi/', '/location/north-athens/'],
  ['/store/fanopoieiomarousi/', '/location/north-athens/'],
  ['/store/fanopoieio-metamorfosi/', '/location/north-athens/'],
  ['/store/agios-dimitrios/', '/location/notia-proastia/'],
  ['/store/george-force/', '/locations/'],
  ['/store/motonkosmos/', '/locations/'],
  ['/store/%cf%83%cf%85%ce%bd%ce%b5%cf%81%ce%b3%ce%b5%ce%af%ce%bf-%cf%83%cf%84%ce%bf-%ce%ba%ce%b5%cf%81%ce%b1%cf%84%cf%83%ce%af%ce%bd%ce%b9/', '/location/peiraias/'],
  ['/store/synergeio-peristeri/', '/location/dititka-proastia/'],
  ['/store/service-%cf%80%ce%b1%ce%b3%ce%ba%cf%81%ce%ac%cf%84%ce%b9/', '/location/athens-center/'],
  ['/offer_cat/auto-service/', '/offer/service-auto/'],
  ['/offer_cat/service-moto/', '/'],
  ['/offer_cat/aisthitires-parking/', '/'],
  ['/offer_cat/%ce%b1%ce%bb%ce%bb%ce%b1%ce%b3%ce%ae-%ce%bb%ce%b1%ce%b4%ce%b9%cf%8e%ce%bd/', '/offer/service-auto/'],
  ['/offer_cat/automotive/', '/'],
  ['/offer_cat/%ce%b3%cf%85%ce%ac%ce%bb%ce%b9%cf%83%ce%bc%ce%b1-%ce%b1%cf%85%cf%84%ce%bf%ce%ba%ce%b9%ce%bd%ce%ae%cf%84%ce%bf%cf%85/', '/'],
  ['/offer_cat/disk/', '/offer/set_disk_all_cars/'],
  ['/offer_cat/imantas-xronismou/', '/offer/set-imantas-xronismou/'],
  ['/offer_cat/meriki-vafi/', '/offer/vafi-profylaktira-portas/'],
  ['/offer_cat/moto/', '/'],
  ['/offer_cat/%ce%bf%ce%bb%ce%b9%ce%ba%ce%ae-%ce%b2%ce%b1%cf%86%ce%ae/', '/offer/vafi-oliki/'],
  ['/offer_cat/takakia/', '/offer/service-auto/'],
  ['/offer_tag/auto-service/', '/offer/service-auto/'],
  ['/offer_tag/smart/', '/'],
  ['/offer_tag/smart-service/', '/offer/service-auto/'],
  ['/offer_tag/%ce%b3%cf%85%ce%ac%ce%bb%ce%b9%cf%83%ce%bc%ce%b1-%ce%b1%cf%85%cf%84%ce%bf%ce%ba%ce%b9%ce%bd%ce%ae%cf%84%ce%bf%cf%85/', '/'],
  ['/offer_tag/vafi-tmimatos-auto/', '/offer/vafi-profylaktira-portas/'],
  ['/offer_tag/oliki-vafi-auto/', '/offer/vafi-oliki/'],
  ['/letter/voria-athens/', '/location/north-athens/'],
  ['/letter/ditika-athens/', '/location/dititka-proastia/'],
  ['/letter/kentro-athens/', '/location/athens-center/'],
  ['/letter/notia-athens/', '/location/notia-proastia/'],
]

/** WordPress theme demo pages, never real content: left to 404 on purpose. */
const GONE = [
  '/full-width/',
  '/sidebar-left/',
  '/sidebar-right/',
  '/sample-page/',
]

test('the list covers every URL of the old sitemap', () => {
  expect(SERVED_AS_IS.length + REDIRECTED.length + GONE.length).toBe(76)
})

test.describe('Old URLs Google knows keep working', () => {
  for (const path of SERVED_AS_IS) {
    test(`${decodeURIComponent(path)} is served as is`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(200)
    })
  }

  for (const [from, to] of REDIRECTED) {
    test(`${decodeURIComponent(from)} → ${to}`, async ({ request }) => {
      // One permanent hop, straight to the final page: a chain leaks ranking.
      const res = await request.get(from, { maxRedirects: 0 })
      expect(res.status()).toBe(308)
      expect(res.headers()['location']).toBe(to)
      expect((await request.get(to, { maxRedirects: 0 })).status()).toBe(200)
    })
  }

  for (const path of GONE) {
    test(`${path} is gone`, async ({ request }) => {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404)
    })
  }
})
