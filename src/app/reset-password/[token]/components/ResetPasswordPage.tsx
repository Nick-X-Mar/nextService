'use client'

import { useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = params?.token || ''
  const userType = searchParams.get('userType') === 'garage' ? 'garage' : 'client'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const { error, success } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < MIN_PASSWORD_LENGTH) {
      error('Σφάλμα', 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες')
      return
    }
    if (password !== confirmPassword) {
      error('Σφάλμα', 'Οι κωδικοί δεν ταιριάζουν')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userType, newPassword: password })
      })
      const data = await response.json()

      if (response.ok && data.success) {
        setCompleted(true)
        success('Επιτυχία', 'Ο κωδικός σου ενημερώθηκε')
        // Redirect to login after a short delay so the user sees feedback.
        setTimeout(() => router.push('/login/'), 1800)
      } else {
        error('Σφάλμα', data.error || 'Δεν ήταν δυνατή η επαναφορά')
      }
    } catch {
      error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  if (completed) {
    return (
      <div className="bg-surface flex items-start justify-center px-4 pt-8 md:pt-16 pb-4">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6">
              <Icon name="check_circle" filled className="text-green-600" size="xl" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-on-surface mb-3">
              Ο κωδικός ενημερώθηκε
            </h2>
            <p className={`${styles.bodyText} mb-6`}>
              Μεταφέρεσαι στη σελίδα σύνδεσης...
            </p>
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
            Νέος κωδικός
          </h1>
          <p className={styles.bodyText}>
            Επίλεξε έναν νέο κωδικό για τον λογαριασμό σου
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={styles.labelUpper}>Νέος κωδικός</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`}
                  required
                  disabled={isLoading}
                  className={`${styles.input} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size="sm" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={styles.labelUpper}>Επιβεβαίωση κωδικού</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Επαναλάβετε τον κωδικό"
                required
                disabled={isLoading}
                className={styles.input}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-error">Οι κωδικοί δεν ταιριάζουν</p>
              )}
            </div>

            <button
              type="submit"
              className={`${styles.btnPrimary} w-full justify-center text-base py-3 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              <Icon name="lock_reset" size="sm" />
              {isLoading ? 'Παρακαλώ περιμένετε...' : 'Ενημέρωση κωδικού'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login/" className={styles.linkText}>
              Επιστροφή στη σύνδεση
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
