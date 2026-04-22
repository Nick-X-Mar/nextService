'use client'

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import SegmentedControl from '@/components/SegmentedControl'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [userType, setUserType] = useState('client')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showEmailHint, setShowEmailHint] = useState(false)

  const { error } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      error('Σφάλμα', 'Συμπληρώστε το email σας')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), userType })
      })

      // Always show success UI regardless of whether the email existed —
      // the server already returns a generic response for security.
      if (response.ok) {
        setSubmitted(true)
      } else {
        const data = await response.json().catch(() => ({}))
        error('Σφάλμα', data.error || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.')
      }
    } catch {
      error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-surface flex items-start justify-center px-4 pt-8 md:pt-16 pb-4">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6">
              <Icon name="mark_email_read" filled className="text-green-600" size="xl" />
            </div>

            <h2 className="text-xl font-black tracking-tight text-on-surface mb-3">
              Έλεγξε το email σου
            </h2>

            <p className={`${styles.bodyText} mb-2`}>
              Αν το <strong className="text-on-surface">{email}</strong> αντιστοιχεί σε λογαριασμό, θα λάβεις σύνδεσμο επαναφοράς κωδικού μέσα στα επόμενα λεπτά.
            </p>

            <p className={`${styles.bodyText} mb-8`}>
              Ο σύνδεσμος ισχύει για 1 ώρα. Έλεγξε και τον φάκελο spam.
            </p>

            <Link href="/login" className={`${styles.btnOutline} w-full justify-center py-3.5`}>
              <Icon name="arrow_back" size="sm" />
              Επιστροφή στη σύνδεση
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface flex items-start justify-center px-4 pt-2 md:pt-12 pb-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-3">
          <h1 className="text-xl font-black tracking-tight text-on-surface mb-0.5">
            Επαναφορά κωδικού
          </h1>
          <p className={styles.bodyText}>
            Θα σου στείλουμε σύνδεσμο για να ορίσεις νέο κωδικό
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <SegmentedControl
              options={[
                { value: 'client', label: 'Πελάτης' },
                { value: 'garage', label: 'Συνεργείο' }
              ]}
              value={userType}
              onChange={setUserType}
              variant="orange"
              className="max-w-xs mx-auto"
            />

            <div className="space-y-1.5">
              <label className={styles.labelUpper}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  const raw = e.target.value
                  const clean = raw.replace(/[^a-zA-Z0-9@._+\-]/g, '')
                  setEmail(clean)
                  setShowEmailHint(raw.length !== clean.length)
                }}
                placeholder="π.χ. example@email.com"
                required
                disabled={isLoading}
                className={styles.input}
              />
              {showEmailHint && (
                <p className="text-xs text-error mt-1 flex items-center gap-1">
                  <Icon name="keyboard" size="sm" /> Χρησιμοποίησε λατινικούς χαρακτήρες — γύρισε το πληκτρολόγιο σε Αγγλικά.
                </p>
              )}
            </div>

            <button
              type="submit"
              className={`${styles.btnPrimary} w-full justify-center text-base py-3 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              <Icon name="mail" size="sm" />
              {isLoading ? 'Παρακαλώ περιμένετε...' : 'Στείλε μου σύνδεσμο'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className={styles.linkText}>
              Επιστροφή στη σύνδεση
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
