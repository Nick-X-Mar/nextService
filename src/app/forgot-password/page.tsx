import ForgotPasswordPage from './components/ForgotPasswordPage'
import { SITE_URL } from '@/lib/site-url'

// The brand comes from the `%s | NextService` title template — repeating it
// here read "… - NextService | NextService". `noindex` like /login/: robots.txt
// already disallows it, and a reset form has no search value.
export const metadata = {
  title: 'Επαναφορά κωδικού',
  description: 'Ζητήστε σύνδεσμο επαναφοράς κωδικού για τον λογαριασμό σας',
  robots: { index: false, follow: true },
  // Its own share tags: without them it inherited the homepage's og:url and title.
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/forgot-password/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'Επαναφορά κωδικού | NextService',
    images: [{ url: `${SITE_URL}/opengraph-image/`, width: 1200, height: 630, alt: 'NextService', type: 'image/png' }],
  },
}

export default function Page() {
  return <ForgotPasswordPage />
}
