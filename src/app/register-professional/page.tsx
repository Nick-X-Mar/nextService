import type { Metadata } from 'next'
import RegisterProfessionalPage from './components/RegisterProfessionalPage'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Εγγραφή Συνεργείου',
  description:
    'Εγγράψτε το συνεργείο σας στο NextService και λάβετε αιτήματα πελατών από την περιοχή σας. Χωρίς μηνιαία συνδρομή — πληρώνετε μόνο όταν κλείνετε δουλειά.',
  alternates: { canonical: `${SITE_URL}/register-professional/` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/register-professional/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'Εγγραφή Συνεργείου | NextService',
    description:
      'Κάνε εγγραφή στο NextService και δες αιτήματα πελατών στην περιοχή σου.',
    images: [
      {
        url: `${SITE_URL}/opengraph-image/`,
        width: 1200,
        height: 630,
        alt: 'NextService',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Εγγραφή Συνεργείου | NextService',
    description: 'Κάνε εγγραφή στο NextService και δες αιτήματα πελατών στην περιοχή σου.',
    images: [`${SITE_URL}/opengraph-image/`],
  },
}

const URL = `${SITE_URL}/register-professional/`

export default function Page() {
  return (
    <>
      <script
        {...jsonLdScript(
          graphJsonLd([
            {
              '@type': 'WebPage',
              '@id': `${URL}#webpage`,
              name: 'Εγγραφή Συνεργείου',
              description:
                'Εγγραφή επαγγελματικού συνεργείου στο NextService, για λήψη αιτημάτων service από πελάτες της περιοχής.',
              url: URL,
              inLanguage: 'el-GR',
            },
            breadcrumbJsonLd([
              { name: 'Αρχική', url: `${SITE_URL}/` },
              { name: 'Εγγραφή Συνεργείου', url: URL },
            ]),
          ])
        )}
      />
      <RegisterProfessionalPage />
    </>
  )
}
