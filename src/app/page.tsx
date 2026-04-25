import type { Metadata } from 'next'
import LandingPage from './landing-page/LandingPage'
import { faqs } from './landing-page/components/FAQSection'
import { SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή',
    description:
      'Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές. Hot deals σε service, συμπλέκτη, ιμάντα χρονισμού και φανοποιεία.',
    // Trailing slash required — without it, Next.js generates a URL that
    // 308-redirects and Facebook/Messenger crawlers don't follow OG image
    // redirects (preview shows the link with no image).
    images: [
      {
        url: `${SITE_URL}/opengraph-image/`,
        width: 1200,
        height: 630,
        alt: 'NextService',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή',
    description: 'Στείλε αίτημα σε συνεργεία σε όλη την Ελλάδα και πάρε προσφορές σε service και φανοποιεία.',
    images: [`${SITE_URL}/opengraph-image/`],
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'NextService',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  areaServed: { '@type': 'Country', name: 'GR' },
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'info@nextservice.gr',
    contactType: 'customer support',
    availableLanguage: ['Greek', 'English'],
  },
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'NextService',
  url: SITE_URL,
  inLanguage: 'el-GR',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.answer,
    },
  })),
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingPage />
    </>
  )
}
