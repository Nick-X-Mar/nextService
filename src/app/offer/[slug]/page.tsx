import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import OfferDetailPage from './components/OfferDetailPage'
import { getOfferBySlug, type Offer } from '@/lib/offers'
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

function absoluteImage(image: string | undefined): string {
  if (!image) return `${SITE_URL}/logo.png`
  if (image.startsWith('http')) return image
  return `${SITE_URL}${image.startsWith('/') ? '' : '/'}${image}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const offer = await getOfferBySlug(decodeURIComponent(slug))

  if (!offer) {
    return {
      title: 'Η εργασία δεν βρέθηκε',
      robots: { index: false, follow: true },
    }
  }

  const url = `${SITE_URL}/offer/${offer.slug}/`
  // Title ≤ 60 chars for Google SERP. The car is part of the claim — the price
  // only means something next to it — so it goes in the title whenever it fits.
  const titleWithCar = `${offer.title} ${offer.subtitle} — ${offer.price}`
  const title = titleWithCar.length <= 60 ? titleWithCar : `${offer.title} — ${offer.price}`
  const ogTitle = `${title} | NextService`
  // Description 110-160 chars.
  const description = `${offer.title} σε ${offer.subtitle}: ${offer.price}. Πραγματική τιμή από εργασία που έγινε μέσω NextService. ${offer.details.slice(0, 2).join(' · ')}.`

  // Explicit OG image URL WITH trailing slash. Without this, Next.js generates
  // /opengraph-image (no slash) which 308-redirects under trailingSlash:true,
  // and Facebook/Messenger crawlers do not follow OG image redirects.
  const ogImage = {
    url: `${SITE_URL}/offer/${offer.slug}/opengraph-image/`,
    width: 1200,
    height: 630,
    alt: offer.title,
    type: 'image/jpeg',
  }

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'NextService',
      locale: 'el_GR',
      title: ogTitle,
      description,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImage.url],
    },
  }
}

/**
 * These pages document a job that was actually done, at the price the garage
 * charged for that one car. They are not a purchasable listing.
 *
 * They used to be marked up as Product + Offer, with `price`, `InStock` and a
 * `priceValidUntil` invented as "today + 1 year" — a promise of a price nobody
 * can honour, and a Google structured-data violation the moment the page text
 * says the price may differ. The node is now a plain Service: no price, no
 * availability, nothing a visitor could hold us to. The real figure still
 * reaches search and AI assistants through the FAQ text below, which is
 * rendered on the page.
 */
function buildOfferJsonLd(offer: Offer) {
  const url = `${SITE_URL}/offer/${offer.slug}/`

  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: `${offer.title} — ${offer.subtitle}`,
    serviceType: offer.workType,
    description: `${offer.title} σε ${offer.subtitle}, ολοκληρωμένη εργασία μέσω NextService. ${offer.description}`,
    image: absoluteImage(offer.image),
    category: offer.category === 'fanopeia' ? 'Φανοποιεία' : 'Service αυτοκινήτου',
    provider: { '@id': ORGANIZATION_ID },
    areaServed: { '@type': 'Country', name: 'GR' },
  }
}

/**
 * Carries the recency signal that used to sit on the Product node — AI search
 * engines weight it heavily when choosing between competing sources. `Service`
 * is a Thing, not a CreativeWork, so the dates belong on a WebPage instead.
 */
function buildOfferPageJsonLd(offer: Offer) {
  const url = `${SITE_URL}/offer/${offer.slug}/`

  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: `${offer.title} — ${offer.subtitle}`,
    inLanguage: 'el-GR',
    about: { '@id': `${url}#service` },
    ...(offer.updatedAt ? { dateModified: offer.updatedAt } : {}),
    ...(offer.createdAt ? { datePublished: offer.createdAt } : {}),
  }
}

/**
 * Question-shaped restatement of the offer's own facts.
 *
 * Assistants extract and quote Q&A passages far more readily than they do
 * marketing prose, and "πόσο κοστίζει X" is the single most common way this
 * gets asked. Everything here is rendered on the page — schema that describes
 * content a visitor can't see is a structured-data violation.
 */
function buildOfferFaqs(offer: Offer) {
  return [
    {
      question: `Πόσο κοστίζει ${offer.title.toLowerCase()};`,
      answer: `${offer.title} σε ${offer.subtitle} κόστισε ${offer.price}, με την εργασία και τα επώνυμα ανταλλακτικά μέσα στην τιμή. Είναι πραγματική εργασία που έγινε μέσω NextService, όχι τυποποιημένο πακέτο ούτε τιμοκατάλογος — για το δικό σου αυτοκίνητο η τιμή μπορεί να είναι διαφορετική. Στείλε αίτημα και θα λάβεις τη δική σου προσφορά από συνεργεία της περιοχής σου.`,
    },
    {
      question: `Πόση ώρα χρειάζεται ${offer.title.toLowerCase()};`,
      answer: `Η εκτιμώμενη διάρκεια είναι ${offer.duration}. Το συνεργείο θα σου επιβεβαιώσει τον ακριβή χρόνο ανάλογα με το μοντέλο και την κατάσταση του οχήματος.`,
    },
    {
      question: 'Τι περιλάμβανε η τιμή;',
      answer: `${offer.details.join('. ')}. Σε κάθε προσφορά που λαμβάνεις, το συνεργείο αναφέρει ρητά τι περιλαμβάνεται και δεν υπάρχουν κρυφές χρεώσεις — αν κατά τον έλεγχο προκύψει κάτι επιπλέον, οφείλει να σε ενημερώσει και να πάρει τη συγκατάθεσή σου πριν προχωρήσει.`,
    },
    {
      question: 'Ισχύει για το δικό μου αυτοκίνητο;',
      answer: `Η εργασία αυτή έγινε σε ${offer.subtitle}, οπότε η τιμή δεν ισχύει αυτούσια για κάθε αυτοκίνητο — λειτουργεί σαν ένδειξη κόστους. Στείλε αίτημα με μάρκα, μοντέλο και έτος και θα λάβεις τη δική σου προσφορά από συνεργεία της περιοχής σου.`,
    },
  ]
}

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const offer = await getOfferBySlug(decodedSlug)

  if (!offer) {
    return <OfferDetailPage slug={decodedSlug} initialOffer={null} />
  }

  const url = `${SITE_URL}/offer/${offer.slug}/`
  const faqs = buildOfferFaqs(offer)
  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Ολοκληρωμένες εργασίες', url: `${SITE_URL}/` },
    { name: offer.title, url },
  ])

  return (
    <>
      <script
        {...jsonLdScript(
          graphJsonLd([
            buildOfferJsonLd(offer),
            buildOfferPageJsonLd(offer),
            crumbs,
            faqJsonLd(faqs),
          ])
        )}
      />

      <OfferDetailPage slug={decodedSlug} initialOffer={offer} />

      {/* Server-rendered so it's in the HTML for crawlers that don't run JS. */}
      <section className="bg-surface px-5 md:px-8 pb-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
            Συχνές ερωτήσεις
          </h2>

          <div className="space-y-3">
            {faqs.map((faq) => (
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

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/locations/"
              className="inline-flex border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 items-center gap-2"
            >
              <Icon name="location_on" size="sm" />
              Συνεργεία στην περιοχή μου
            </Link>
            <Link
              href="/faq/"
              className="inline-flex border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 items-center gap-2"
            >
              <Icon name="help" size="sm" />
              Όλες οι ερωτήσεις
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
