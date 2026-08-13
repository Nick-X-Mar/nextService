import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { SITE_URL } from '@/lib/site-url'
import { CONTACT_EMAIL, ORGANIZATION_ID, breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

const URL = `${SITE_URL}/contact/`

const TITLE = 'Επικοινωνία'
const DESCRIPTION =
  'Επικοινώνησε με την ομάδα του NextService για απορίες, υποστήριξη, συνεργασία ή θέματα προσωπικών δεδομένων.'

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
}

const contactPageJsonLd = {
  '@type': 'ContactPage',
  '@id': `${URL}#contactpage`,
  name: TITLE,
  description: DESCRIPTION,
  url: URL,
  inLanguage: 'el-GR',
  about: { '@id': ORGANIZATION_ID },
}

const channels = [
  {
    icon: 'support_agent',
    title: 'Υποστήριξη πελατών',
    body: 'Απορίες για αίτημα, προσφορά ή ραντεβού.',
    email: CONTACT_EMAIL,
  },
  {
    icon: 'build',
    title: 'Συνεργεία',
    body: 'Εγγραφή, στοιχεία λογαριασμού ή ερωτήσεις για τη λειτουργία.',
    email: CONTACT_EMAIL,
  },
  {
    icon: 'gavel',
    title: 'Νομικά και προσωπικά δεδομένα',
    body: 'Αιτήματα GDPR, όροι χρήσης, πολιτική απορρήτου.',
    email: 'legal@nextservice.gr',
  },
]

export default function ContactPage() {
  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: TITLE, url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([contactPageJsonLd, crumbs]))} />

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
              <li className="text-primary">Επικοινωνία</li>
            </ol>
          </nav>

          <header className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
              <span className="text-primary">Επικοινωνία</span>
            </h1>
            <p className="mt-4 text-base text-secondary leading-relaxed">
              Απαντάμε σε κάθε μήνυμα. Για ερώτηση που αφορά συγκεκριμένο αίτημα, ανάφερε
              τον αριθμό του ώστε να το βρούμε γρήγορα.
            </p>
          </header>

          <ul className="grid gap-4 sm:grid-cols-2 mb-10">
            {channels.map((c) => (
              <li
                key={c.title}
                className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10"
              >
                <Icon name={c.icon} size="lg" className="text-primary mb-3" />
                <h2 className="text-lg font-bold text-on-surface mb-1">{c.title}</h2>
                <p className="text-sm text-secondary leading-relaxed mb-3">{c.body}</p>
                <a
                  href={`mailto:${c.email}`}
                  className="text-sm text-primary hover:text-primary-container font-bold break-all"
                >
                  {c.email}
                </a>
              </li>
            ))}
          </ul>

          <section className="bg-surface-container-low rounded-xl p-6">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-3">
              Πριν μας γράψεις
            </h2>
            <p className="text-sm text-secondary leading-relaxed mb-4">
              Οι περισσότερες ερωτήσεις απαντώνται ήδη στις συχνές ερωτήσεις — τιμές,
              χρόνοι απάντησης, ανταλλακτικά, ακυρώσεις και εγγύηση.
            </p>
            <Link
              href="/faq/"
              className="inline-flex border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 items-center gap-2"
            >
              <Icon name="help" size="sm" />
              Συχνές ερωτήσεις
            </Link>
          </section>
        </div>
      </div>
    </>
  )
}
