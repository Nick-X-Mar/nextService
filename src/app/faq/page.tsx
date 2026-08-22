import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, faqJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'
import { collectFaqItems, getSitePage } from '@/lib/site-content'
import ContentBlocks from '@/components/content/ContentBlocks'
import ContentHero from '@/components/content/ContentHero'
import Breadcrumb from '@/components/content/Breadcrumb'
import { toPlainText } from '@/components/content/RichText'

const URL = `${SITE_URL}/faq/`

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage('faq')
  const title = page.meta.title
  const description = toPlainText(page.meta.description)

  return {
    title,
    description,
    alternates: { canonical: URL },
    openGraph: {
      type: 'website',
      url: URL,
      siteName: 'NextService',
      locale: 'el_GR',
      title: `${title} | NextService`,
      description,
      images: [
        {
          url: `${SITE_URL}/opengraph-image/`,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | NextService`,
      description,
      images: [`${SITE_URL}/opengraph-image/`],
    },
  }
}

export default async function FaqPage() {
  const page = await getSitePage('faq')

  // Answers may carry inline markup for the reader; structured data must not.
  const items = collectFaqItems(page.blocks).map((item) => ({
    question: toPlainText(item.question),
    answer: toPlainText(item.answer),
  }))

  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Συχνές ερωτήσεις', url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([faqJsonLd(items), crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-3xl mx-auto px-5 md:px-8 pt-8">
          <Breadcrumb label="Συχνές ερωτήσεις" />
          <ContentHero hero={page.hero} />
          <ContentBlocks blocks={page.blocks} />
        </div>
      </div>
    </>
  )
}
