import type { Metadata } from 'next'
import RegisterProfessionalPage from './components/RegisterProfessionalPage'
import { SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Εγγραφή Συνεργείου',
  description:
    'Εγγράψτε το συνεργείο σας στο NextService και λάβετε αιτήματα πελατών από όλη την Ελλάδα. Χωρίς μηνιαία συνδρομή — πληρώνετε μόνο όταν κλείνετε δουλειά.',
  alternates: { canonical: `${SITE_URL}/register-professional/` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/register-professional/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'Εγγραφή Συνεργείου | NextService',
    description:
      'Κάνε εγγραφή στο NextService και δες αιτήματα πελατών στην περιοχή σου.',
    images: [{ url: '/logo.png', alt: 'NextService' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Εγγραφή Συνεργείου | NextService',
    description: 'Κάνε εγγραφή στο NextService και δες αιτήματα πελατών στην περιοχή σου.',
    images: ['/logo.png'],
  },
}

export default function Page() {
  return <RegisterProfessionalPage />
}
