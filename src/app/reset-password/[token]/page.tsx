import ResetPasswordPage from './components/ResetPasswordPage'

// The brand comes from the title template. A URL carrying a reset token must
// never be indexed or followed.
export const metadata = {
  title: 'Νέος κωδικός',
  description: 'Ορίστε νέο κωδικό για τον λογαριασμό σας',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ResetPasswordPage />
}
