import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'
import { getAllAreas, getSitePage } from '@/lib/site-content'
import ContentBlocks from '@/components/content/ContentBlocks'
import ContentHero from '@/components/content/ContentHero'
import Breadcrumb from '@/components/content/Breadcrumb'
import { toPlainText } from '@/components/content/RichText'
import AreaGrid from './components/AreaGrid'

const URL = `${SITE_URL}/locations/`

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage('locations')
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

export default async function LocationsPage() {
  const [page, areas] = await Promise.all([getSitePage('locations'), getAllAreas()])

  const itemListJsonLd = {
    '@type': 'ItemList',
    '@id': `${URL}#itemlist`,
    name: page.meta.title,
    itemListElement: areas.map((area, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: area.name,
      url: `${SITE_URL}/location/${area.slug}/`,
    })),
  }

  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Περιοχές', url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([itemListJsonLd, crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-4xl mx-auto px-5 md:px-8 pt-8">
          <Breadcrumb label="Περιοχές" />
          <ContentHero hero={page.hero} />
          <ContentBlocks blocks={page.blocks} renderAreas={() => <AreaGrid areas={areas} />} />
        </div>
      </div>
    </>
  )
}
