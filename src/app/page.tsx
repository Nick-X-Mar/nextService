import type { Metadata } from 'next'
import LandingPage from './landing-page/LandingPage'
import { faqs } from '@/data/faq'
import { SITE_URL } from '@/lib/site-url'
import { faqJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'NextService — Βρες συνεργείο αυτοκινήτου με την καλύτερη τιμή',
    description:
      'Στείλε δωρεάν αίτημα service και πάρε προσφορές από συνεργεία της περιοχής σου. Δες πραγματικές τιμές από ολοκληρωμένες εργασίες σε service, συμπλέκτη και φανοποιεία.',
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
    description: 'Στείλε δωρεάν αίτημα service και πάρε προσφορές από συνεργεία της περιοχής σου.',
    images: [`${SITE_URL}/opengraph-image/`],
  },
}

// Organization + WebSite are emitted site-wide from the root layout.
export default function Home() {
  return (
    <>
      <script {...jsonLdScript(graphJsonLd([faqJsonLd(faqs)]))} />
      <LandingPage />
    </>
  )
}
