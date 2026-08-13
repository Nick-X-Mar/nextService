import LoginPage from './components/LoginPage'

// Title suffix comes from the `%s | NextService` template in the root layout —
// don't repeat the brand here.
// `noindex` because a login form has no search value, but the page stays
// crawlable and `follow` so the legacy /profile/ and /recover/ redirects that
// land here still pass their authority onward.
export const metadata = {
  title: 'Σύνδεση',
  description: 'Συνδεθείτε στον λογαριασμό σας για να δείτε τα αιτήματά σας',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <LoginPage />
}
