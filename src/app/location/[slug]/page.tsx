import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { ACTIVE_GARAGE_LOCATIONS, areas, getArea, type Area } from '@/data/locations'
import { getAllOffers } from '@/lib/offers'
import { SITE_URL } from '@/lib/site-url'
import {
  ORGANIZATION_ID,
  breadcrumbJsonLd,
  faqJsonLd,
  graphJsonLd,
  jsonLdScript,
} from '@/lib/seo'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return areas.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const area = getArea(slug)
  if (!area) {
    return { title: 'Η περιοχή δεν βρέθηκε', robots: { index: false, follow: true } }
  }

  const url = `${SITE_URL}/location/${area.slug}/`
  return {
    title: area.title,
    description: area.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'NextService',
      locale: 'el_GR',
      title: `${area.title} | NextService`,
      description: area.description,
      images: [
        {
          url: `${SITE_URL}/opengraph-image/`,
          width: 1200,
          height: 630,
          alt: area.title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${area.title} | NextService`,
      description: area.description,
      images: [`${SITE_URL}/opengraph-image/`],
    },
  }
}

/**
 * Deliberately NOT `LocalBusiness` — NextService has no physical premises in
 * these areas, and fake LocalBusiness markup is exactly what Google issues
 * manual actions for.
 *
 * `Service` with `areaServed` is only emitted where the network actually has a
 * garage serving the area. On an 'expanding' area, claiming `areaServed` would
 * be the same misrepresentation one level down in the markup, so those pages
 * get a plain `WebPage` node instead.
 */
function buildAreaJsonLd(area: Area) {
  const url = `${SITE_URL}/location/${area.slug}/`

  if (area.coverage !== 'active') {
    return {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      name: area.title,
      description: area.description,
      url,
      inLanguage: 'el-GR',
      about: { '@id': ORGANIZATION_ID },
    }
  }

  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: area.title,
    description: area.description,
    serviceType: 'Επισκευή και συντήρηση αυτοκινήτου',
    url,
    inLanguage: 'el-GR',
    provider: { '@id': ORGANIZATION_ID },
    areaServed: area.activeIn.map((n) => ({ '@type': 'Place' as const, name: n })),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Υπηρεσίες ${area.nameGenitive}`,
      itemListElement: area.commonServices.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s },
      })),
    },
  }
}

export default async function LocationPage({ params }: PageProps) {
  const { slug } = await params
  const area = getArea(slug)
  if (!area) notFound()

  const offers = await getAllOffers()
  const url = `${SITE_URL}/location/${area.slug}/`

  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Περιοχές', url: `${SITE_URL}/locations/` },
    { name: area.name, url },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([buildAreaJsonLd(area), crumbs, faqJsonLd(area.faqs)]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-4xl mx-auto px-5 md:px-8 pt-8">
          {/* Breadcrumb — visible, matching the schema above */}
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">
                  Αρχική
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/locations/" className="hover:text-primary transition-colors">
                  Περιοχές
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-primary">{area.name}</li>
            </ol>
          </nav>

          <header className="mb-8">
            <h1 className="text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
              Συνεργείο αυτοκινήτου{' '}
              <span className="text-primary">{area.nameGenitive}</span>
            </h1>

            {/* Coverage status, stated before anything else on the page. A
                visitor searching for a garage here must not have to read to the
                bottom to find out whether we actually have one. */}
            <div
              className={`mt-5 flex items-start gap-3 rounded-xl p-4 border ${
                area.coverage === 'active'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <Icon
                name={area.coverage === 'active' ? 'check_circle' : 'info'}
                size="md"
                className={
                  area.coverage === 'active' ? 'text-green-700 shrink-0' : 'text-amber-800 shrink-0'
                }
              />
              <p
                className={`text-sm leading-relaxed ${
                  area.coverage === 'active' ? 'text-green-900' : 'text-amber-900'
                }`}
              >
                {area.coverage === 'active' ? (
                  <>
                    <strong>Ενεργά συνεργεία στην περιοχή:</strong>{' '}
                    {area.activeIn.join(', ')}. Στείλε αίτημα και θα δεις ποια μπορούν να
                    αναλάβουν την εργασία σου και πότε.
                  </>
                ) : (
                  <>
                    <strong>Δεν έχουμε ακόμη ενεργό συνεργείο {area.nameGenitive}.</strong>{' '}
                    Τα εγγεγραμμένα μας συνεργεία βρίσκονται σε{' '}
                    {ACTIVE_GARAGE_LOCATIONS.join(' και ')}, και το δίκτυο επεκτείνεται.
                    Μπορείς να στείλεις αίτημα — είναι δωρεάν και χωρίς δέσμευση, και θα σου
                    απαντήσουν όσα συνεργεία μπορούν να σε εξυπηρετήσουν.
                  </>
                )}
              </p>
            </div>

            <p className="mt-5 text-base text-secondary leading-relaxed">{area.intro}</p>
            <p className="mt-3 text-base text-secondary leading-relaxed">{area.detail}</p>

            <Link
              href="/car-details/"
              className="mt-6 inline-flex bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 items-center gap-2"
            >
              <Icon name="send" size="sm" />
              Στείλε αίτημα
            </Link>
          </header>

          {/* Coverage */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-1">
              Περιοχές
            </h2>
            <p className="text-sm text-on-surface-variant mb-4">
              Η ενότητα «{area.name}» περιλαμβάνει τις παρακάτω περιοχές. Μπορείς να
              στείλεις αίτημα από οποιαδήποτε από αυτές.
            </p>
            <ul className="flex flex-wrap gap-2">
              {area.neighbourhoods.map((n) => (
                <li
                  key={n}
                  className="bg-secondary-container text-on-secondary-container px-4 py-1.5 rounded-full text-xs font-bold"
                >
                  {n}
                </li>
              ))}
            </ul>
          </section>

          {/* Common services */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Συνηθισμένες εργασίες {area.nameGenitive}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {area.commonServices.map((s) => (
                <li
                  key={s}
                  className="flex items-start gap-3 bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10"
                >
                  <Icon name="check_circle" size="sm" className="text-primary mt-0.5 shrink-0" />
                  <span className="text-sm font-medium text-on-surface">{s}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Hot deals — real internal links into the offer pages */}
          {offers.length > 0 && (
            <section className="mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-1">
                Πακέτα με σταθερή τιμή
              </h2>
              <p className="text-sm text-on-surface-variant mb-4">
                Τιμές εκκίνησης για τις πιο συνηθισμένες εργασίες, με εργασία και επώνυμα
                ανταλλακτικά. Η τελική τιμή επιβεβαιώνεται από το συνεργείο.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {offers.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/offer/${o.slug}/`}
                      className="flex items-center justify-between gap-3 bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300"
                    >
                      <span>
                        <span className="block text-sm font-bold text-on-surface">{o.title}</span>
                        <span className="block text-xs text-on-surface-variant mt-0.5">
                          {o.subtitle}
                        </span>
                      </span>
                      <span className="text-base font-black text-primary whitespace-nowrap">
                        {o.price}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* FAQ */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Συχνές ερωτήσεις — {area.name}
            </h2>
            <div className="space-y-3">
              {area.faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-xl bg-surface-container-lowest border border-outline-variant/10 overflow-hidden"
                >
                  <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <h3 className="font-bold text-on-surface text-sm md:text-base">
                      {faq.question}
                    </h3>
                    <Icon
                      name="expand_more"
                      size="md"
                      className="text-on-surface-variant transition-transform group-open:rotate-180 shrink-0"
                    />
                  </summary>
                  <div className="px-5 pb-5 text-sm text-secondary leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {/* Other areas — internal linking between the location cluster */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Άλλες περιοχές
            </h2>
            <ul className="flex flex-wrap gap-2">
              {areas
                .filter((a) => a.slug !== area.slug)
                .map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/location/${a.slug}/`}
                      className="inline-block border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2 rounded-lg text-sm font-bold transition-colors duration-200"
                    >
                      {a.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
