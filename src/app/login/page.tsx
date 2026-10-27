import { Suspense } from 'react'
import LoginPage from './components/LoginPage'
import { SITE_URL } from '@/lib/site-url'

// Title suffix comes from the `%s | NextService` template in the root layout —
// don't repeat the brand here.
// `noindex` because a login form has no search value, but the page stays
// crawlable and `follow` so the legacy /profile/ and /recover/ redirects that
// land here still pass their authority onward.
export const metadata = {
  title: 'Σύνδεση',
  description: 'Συνδεθείτε στον λογαριασμό σας για να δείτε τα αιτήματά σας',
  robots: { index: false, follow: true },
  // Its own share tags: without them it inherited the homepage's og:url and title.
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/login/`,
    siteName: 'NextService',
    locale: 'el_GR',
    title: 'Σύνδεση | NextService',
    images: [{ url: `${SITE_URL}/opengraph-image/`, width: 1200, height: 630, alt: 'NextService', type: 'image/png' }],
  },
}

// LoginPage reads the `next` search param (set by the middleware and by the
// activation email), so it needs its own Suspense boundary — see the note in
// AppShell about why the shell doesn't provide one.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  )
}
