import type { Metadata } from 'next'
import OfferDetailPage from './components/OfferDetailPage'
import { getOfferBySlug, type Offer } from '@/lib/offers'

interface PageProps {
  params: Promise<{ slug: string }>
}

const SITE_URL = 'https://www.nextservice.gr'

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
  const title = `${offer.title} από ${offer.price} — ${offer.subtitle}`
  const description = `${offer.title} από ${offer.price}. ${offer.details.slice(0, 3).join(' · ')}. Εργασία και επώνυμα ανταλλακτικά. Διάρκεια: ${offer.duration}.`
  const image = absoluteImage(offer.image)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'NextService',
      locale: 'el_GR',
      title: `${title} | NextService`,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: offer.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | NextService`,
      description,
      images: [image],
    },
  }
}

function buildOfferJsonLd(offer: Offer) {
  const url = `${SITE_URL}/offer/${offer.slug}/`
  const image = absoluteImage(offer.image)
  return {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: offer.title,
    description: offer.description,
    url,
    image,
    price: offer.priceNum,
    priceCurrency: 'EUR',
    priceSpecification: {
      '@type': 'PriceSpecification',
      price: offer.priceNum,
      priceCurrency: 'EUR',
    },
    availability: 'https://schema.org/InStock',
    category: offer.category === 'fanopeia' ? 'Φανοποιεία' : 'Service αυτοκινήτου',
    seller: {
      '@type': 'Organization',
      name: 'NextService',
      url: SITE_URL,
    },
    itemOffered: {
      '@type': 'Service',
      name: offer.workType,
      description: offer.description,
      areaServed: { '@type': 'Country', name: 'GR' },
      provider: {
        '@type': 'Organization',
        name: 'NextService',
        url: SITE_URL,
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
