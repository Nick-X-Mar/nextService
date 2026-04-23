import type { Metadata } from 'next'
import LandingPage from './landing-page/LandingPage'

const SITE_URL = 'https://www.nextservice.gr'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
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
      <LandingPage />
    </>
  )
}
