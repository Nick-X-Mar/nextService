import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { faqCategories, allFaqs } from '@/data/faq'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, faqJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

const URL = `${SITE_URL}/faq/`

const TITLE = 'Συχνές ερωτήσεις'
const DESCRIPTION =
  'Απαντήσεις για το πώς λειτουργεί το NextService: πώς στέλνεις αίτημα, πόσο κοστίζει, πόσο γρήγορα έρχονται οι προσφορές, πώς ελέγχονται τα συνεργεία.'

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

export default function FaqPage() {
  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: TITLE, url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([faqJsonLd(allFaqs), crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-3xl mx-auto px-5 md:px-8 pt-8">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">
                  Αρχική
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-primary">Συχνές ερωτήσεις</li>
            </ol>
          </nav>

          <header className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
              Συχνές <span className="text-primary">ερωτήσεις</span>
            </h1>
            <p className="mt-4 text-base text-secondary leading-relaxed">
              Όσα χρειάζεται να ξέρεις πριν στείλεις αίτημα service. Αν δεν βρίσκεις την
              απάντησή σου, γράψε μας στο{' '}
              <a href="mailto:info@nextservice.gr" className="text-primary font-bold underline">
                info@nextservice.gr
              </a>
              .
            </p>
          </header>

          <div className="space-y-10">
            {faqCategories.map((cat) => (
              <section key={cat.id} id={cat.id}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon name={cat.icon} size="md" className="text-primary" />
                  <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                    {cat.title}
                  </h2>
                </div>

                <div className="space-y-3">
                  {cat.items.map((faq) => (
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
            ))}
          </div>

          <div className="mt-12 text-center">
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
