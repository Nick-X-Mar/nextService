import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-url'
import { ORGANIZATION_ID, breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'
import { getSitePage } from '@/lib/site-content'
import ContentBlocks from '@/components/content/ContentBlocks'
import ContentHero from '@/components/content/ContentHero'
import Breadcrumb from '@/components/content/Breadcrumb'
import { toPlainText } from '@/components/content/RichText'

const URL = `${SITE_URL}/contact/`

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage('contact')
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
  }
}

export default async function ContactPage() {
  const page = await getSitePage('contact')

  const contactPageJsonLd = {
    '@type': 'ContactPage',
    '@id': `${URL}#contactpage`,
    name: page.meta.title,
    description: toPlainText(page.meta.description),
    url: URL,
    inLanguage: 'el-GR',
    mainEntity: { '@id': ORGANIZATION_ID },
  }

  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: page.meta.title, url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([contactPageJsonLd, crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-3xl mx-auto px-5 md:px-8 pt-8">
          <Breadcrumb label="Επικοινωνία" />
          <ContentHero hero={page.hero} />
          <ContentBlocks blocks={page.blocks} />
        </div>
      </div>
    </>
  )
}
