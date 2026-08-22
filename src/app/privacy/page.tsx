import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'
import { getSitePage } from '@/lib/site-content'
import ContentBlocks from '@/components/content/ContentBlocks'
import { toPlainText } from '@/components/content/RichText'

const URL = `${SITE_URL}/privacy/`

/**
 * Copy lives in the SiteContent table so it can be corrected without a deploy
 * — which matters most here, where the text is a legal document.
 *
 * The page stays statically rendered and is regenerated at most every five
 * minutes; an admin save also calls `revalidatePath`, so an edit is live
 * immediately rather than at the end of the window. Keeping it static is
 * deliberate: this repo treats static generation as load-bearing for SEO.
 */
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage('privacy')
  return {
    title: page.meta.title,
    description: toPlainText(page.meta.description),
    alternates: { canonical: URL },
  }
}

export default async function PrivacyPage() {
  const page = await getSitePage('privacy')
  const updated = page.updatedAt ? new Date(page.updatedAt) : null

  return (
    <>
      <script
        {...jsonLdScript(
          graphJsonLd([
            {
              '@type': 'WebPage',
              '@id': `${URL}#webpage`,
              name: page.meta.title,
              url: URL,
              inLanguage: 'el-GR',
            },
            breadcrumbJsonLd([
              { name: 'Αρχική', url: `${SITE_URL}/` },
              { name: page.meta.title, url: URL },
            ]),
          ])
        )}
      />

      <div className="min-h-screen bg-surface px-4 py-10">
        <div className="max-w-3xl mx-auto bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">
            {page.hero.title}
            {page.hero.title && page.hero.titleAccent ? ' ' : ''}
            {page.hero.titleAccent && <span className="text-primary">{page.hero.titleAccent}</span>}
          </h1>
          {/* The date the copy actually changed. This used to be `new Date()`,
              which on a static page froze to whenever the build ran. */}
          <p className="text-sm text-on-surface-variant mb-8">
            Τελευταία ενημέρωση:{' '}
            {updated && !isNaN(updated.getTime())
              ? updated.toLocaleDateString('el-GR')
              : '—'}
          </p>

          <section className="text-sm leading-relaxed text-on-surface">
            <ContentBlocks blocks={page.blocks} />
          </section>

          <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center">
            <Link href="/" className="text-sm text-primary underline">
              Επιστροφή στην αρχική
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
