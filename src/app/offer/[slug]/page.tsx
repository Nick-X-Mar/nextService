import type { Metadata } from 'next'
import OfferDetailPage from './components/OfferDetailPage'
import { getOfferBySlug, type Offer } from '@/lib/offers'
import { SITE_URL } from '@/lib/site-url'

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
      title: 'Η προσφορά δεν βρέθηκε',
      robots: { index: false, follow: true },
    }
  }

  const url = `${SITE_URL}/offer/${offer.slug}/`
  // Title ≤ 60 chars for Google SERP. The car model is shown in the OG image visual.
  const title = `${offer.title} από ${offer.price}`
  const ogTitle = `${title} | NextService`
  // Description 110-160 chars.
  const description = `${offer.title} ${offer.subtitle} από ${offer.price}. ${offer.details.slice(0, 2).join(' · ')}. Διάρκεια: ${offer.duration}.`

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
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  }
}

function buildOfferJsonLd(offer: Offer) {
  const url = `${SITE_URL}/offer/${offer.slug}/`
  const image = absoluteImage(offer.image)
  // Offer price is valid for one year from now — required for Product rich
  // results eligibility in Google Search.
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: offer.title,
    description: `${offer.title} — ${offer.subtitle}. ${offer.description}`,
    image,
    brand: {
      '@type': 'Brand',
      name: 'NextService',
    },
    category: offer.category === 'fanopeia' ? 'Φανοποιεία' : 'Service αυτοκινήτου',
    offers: {
      '@type': 'Offer',
      url,
      price: offer.priceNum,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      priceValidUntil,
      seller: {
        '@type': 'Organization',
        name: 'NextService',
        url: SITE_URL,
      },
      areaServed: { '@type': 'Country', name: 'GR' },
      itemOffered: {
        '@type': 'Service',
        name: offer.workType,
        description: offer.description,
        provider: {
          '@type': 'Organization',
          name: 'NextService',
          url: SITE_URL,
        },
      },
    },
  }
}

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const offer = await getOfferBySlug(decodedSlug)

  return (
    <>
      {offer && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOfferJsonLd(offer)) }}
        />
      )}
      <OfferDetailPage slug={decodedSlug} initialOffer={offer} />
    </>
  )
}
