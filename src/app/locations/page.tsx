import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { ACTIVE_GARAGE_LOCATIONS, areas } from '@/data/locations'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

const URL = `${SITE_URL}/locations/`

const TITLE = 'Συνεργεία αυτοκινήτου ανά περιοχή'
const DESCRIPTION =
  'Πού λειτουργεί το NextService. Ενεργά συνεργεία σε Κερατσίνι και Άγιο Δημήτριο, με το δίκτυο να επεκτείνεται στην υπόλοιπη Αττική.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: 'website',
    url: URL,
    siteName: 'NextService',
    locale: 'el_GR',
    title: `${TITLE} | NextService`,
    description: DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/opengraph-image/`,
        width: 1200,
        height: 630,
        alt: TITLE,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} | NextService`,
    description: DESCRIPTION,
    images: [`${SITE_URL}/opengraph-image/`],
  },
}

const itemListJsonLd = {
  '@type': 'ItemList',
  name: TITLE,
  itemListElement: areas.map((a, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: a.title,
    url: `${SITE_URL}/location/${a.slug}/`,
  })),
}

export default function LocationsPage() {
  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Περιοχές', url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([itemListJsonLd, crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-4xl mx-auto px-5 md:px-8 pt-8">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">
                  Αρχική
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-primary">Περιοχές</li>
            </ol>
          </nav>

          <header className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
              Συνεργεία αυτοκινήτου <span className="text-primary">ανά περιοχή</span>
            </h1>

            <div className="mt-5 flex items-start gap-3 rounded-xl p-4 border bg-surface-container-low border-outline-variant/20">
              <Icon name="info" size="md" className="text-primary shrink-0" />
              <p className="text-sm text-on-surface leading-relaxed">
                Το NextService ξεκίνησε πρόσφατα και το δίκτυο συνεργείων χτίζεται. Αυτή τη
                στιγμή έχουμε ενεργά συνεργεία σε{' '}
                <strong>{ACTIVE_GARAGE_LOCATIONS.join(' και ')}</strong>. Μπορείς να
                στείλεις αίτημα από οποιαδήποτε περιοχή — είναι δωρεάν και χωρίς δέσμευση,
                και θα σου απαντήσουν όσα συνεργεία μπορούν να σε εξυπηρετήσουν.
              </p>
            </div>

            <p className="mt-5 text-base text-secondary leading-relaxed">
              Οι σελίδες παρακάτω δείχνουν τι χρειάζονται πιο συχνά τα αυτοκίνητα σε κάθε
              περιοχή, ποιες τιμές να περιμένεις, και πού έχουμε ήδη συνεργεία.
            </p>
          </header>

          <ul className="grid gap-4 sm:grid-cols-2">
            {areas.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/location/${a.slug}/`}
                  className="block h-full bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Icon name="location_on" size="sm" className="text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                        {a.region}
                      </span>
                    </div>
                    <span
                      className={
                        a.coverage === 'active'
                          ? 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm'
                          : 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-800 bg-amber-100 px-2 py-1 rounded-sm'
                      }
                    >
                      {a.coverage === 'active' ? 'Ενεργό' : 'Σύντομα'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-on-surface mb-2">{a.name}</h2>
                  <p className="text-sm text-secondary leading-relaxed">{a.description}</p>
                  <p className="mt-3 text-xs text-on-surface-variant">
                    {a.neighbourhoods.slice(0, 4).join(' · ')}
                    {a.neighbourhoods.length > 4 &&
                      ` + ${a.neighbourhoods.length - 4} ακόμη`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <p className="text-sm text-on-surface-variant mb-4">
              Δεν βλέπεις την περιοχή σου; Στείλε αίτημα — είναι δωρεάν, και αν κάποιο
              συνεργείο μπορεί να σε εξυπηρετήσει θα σου απαντήσει.
            </p>
            <Link
              href="/car-details/"
              className="inline-flex bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 items-center gap-2"
            >
              <Icon name="send" size="sm" />
              Στείλε αίτημα
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
