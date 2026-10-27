import { Suspense } from 'react'
import ConfirmAccountPage from './components/ConfirmAccountPage'

// Reached only from the confirmation email; the link carries a single-use
// token, so there is nothing here for a search engine.
export const metadata = {
  title: 'Επιβεβαίωση λογαριασμού',
  description: 'Επιβεβαιώστε τη μεταφορά των αιτημάτων σας στον λογαριασμό σας',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// ConfirmAccountPage reads the token from the search params, so it needs its
// own Suspense boundary (the app shell doesn't provide one).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConfirmAccountPage />
    </Suspense>
  )
}
