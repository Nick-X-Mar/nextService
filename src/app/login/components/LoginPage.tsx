'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useUser } from '@/contexts/UserContext'
import { useAuth } from '@/contexts/AuthContext'
import { styles } from '@/styles/styles'
import SegmentedControl from '@/components/SegmentedControl'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingValidation, setPendingValidation] = useState<{ companyName: string } | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [userType, setUserType] = useState('client')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showEmailHint, setShowEmailHint] = useState(false)

  const router = useRouter()
  const { success, error } = useToast()
  const { refreshUser } = useUser()
  const { refreshClient, refreshGarage, userType: authUserType, client, garage, isLoading: authLoading } = useAuth()

  // If the user is already authenticated, bounce them to their home.
  // Without this, landing on /login (e.g. via browser back) shows the login
  // form alongside the logged-in chrome (sidebar/header).
  useEffect(() => {
    if (authLoading) return
    if (authUserType === 'garage' && garage) {
      router.replace(`/garage-dashboard/${garage.id}/`)
    } else if (authUserType === 'client' && client) {
      router.replace(`/requests/${client.id}/`)
    }
  }, [authLoading, authUserType, client, garage, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !password) {
      error('Σφάλμα', 'Συμπληρώστε email και κωδικό')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, userType })
      })

      const data = await response.json()

      if (data.success && data.pendingValidation) {
        setPendingValidation({ companyName: data.user.companyName })
        return
      }

      if (data.success && data.user) {
        const user = data.user

        if (userType === 'garage') {
          localStorage.removeItem('clientId')
          localStorage.setItem('garageId', user.id)
          success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.companyName}!`)
          await refreshGarage(user.id)
          router.push(`/garage-dashboard/${user.id}/`)
        } else {
          localStorage.removeItem('garageId')
          localStorage.setItem('clientId', user.id)
          success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.firstName}!`)
          await refreshClient(user.id)
          router.push(`/requests/${user.id}/`)
        }
      } else {
        error('Σφάλμα Σύνδεσης', data.error || 'Λάθος email ή κωδικός')
      }
    } catch {
      error('Σφάλμα Σύνδεσης', 'Δεν ήταν δυνατή η σύνδεση. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !password) {
      error('Σφάλμα', 'Συμπληρώστε όλα τα πεδία')
      return
    }

    if (password.length < 6) {
      error('Σφάλμα', 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες')
      return
    }

    if (password !== confirmPassword) {
      error('Σφάλμα', 'Οι κωδικοί δεν ταιριάζουν')
      return
    }

    if (!acceptedTerms) {
      error('Σφάλμα', 'Πρέπει να αποδεχτείς τους Όρους Χρήσης και την Πολιτική Απορρήτου')
      return
    }

    if (userType === 'garage') {
      sessionStorage.setItem('garageRegEmail', email.trim().toLowerCase())
      sessionStorage.setItem('garageRegPassword', password)
      router.push('/register-professional/')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          firstName: email.trim().split('@')[0],
          acceptedTerms: true
        })
      })

      const data = await response.json()

      if (data.success) {
        localStorage.removeItem('garageId')
        localStorage.setItem('clientId', data.client.id)
        await refreshClient(data.client.id)
        await refreshUser(data.client.id)
        success('Επιτυχής Εγγραφή', 'Ο λογαριασμός σας δημιουργήθηκε!')
        router.push(`/requests/${data.client.id}/`)
      } else {
        error('Σφάλμα Εγγραφής', data.error || 'Δεν ήταν δυνατή η εγγραφή')
      }
    } catch {
      error('Σφάλμα Εγγραφής', 'Δεν ήταν δυνατή η εγγραφή. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  if (pendingValidation) {
    return (
      <div className="bg-surface flex items-start justify-center px-4 pt-8 md:pt-16 pb-4">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-50 mb-6">
              <Icon name="hourglass_top" filled className="text-amber-600" size="xl" />
            </div>

            <h2 className="text-xl font-black tracking-tight text-on-surface mb-3">
              Η αίτησή σας εξετάζεται
            </h2>

            <p className={`${styles.bodyText} mb-2`}>
              Η εταιρεία <strong className="text-on-surface">{pendingValidation.companyName}</strong> έχει εγγραφεί επιτυχώς.
            </p>

            <p className={`${styles.bodyText} mb-8`}>
              Η αίτησή σας βρίσκεται υπό έλεγχο. Θα ενημερωθείτε μόλις ενεργοποιηθεί ο λογαριασμός σας.
            </p>

            <button
              onClick={() => {
                setPendingValidation(null)
                setPassword('')
                setEmail('')
              }}
              className={`${styles.btnOutline} w-full justify-center py-3.5`}
            >
              <Icon name="logout" size="sm" />
              Επιστροφή
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface flex items-start justify-center px-4 pt-2 md:pt-12 pb-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-3">
          <h1 className="text-xl font-black tracking-tight text-on-surface mb-0.5">
            {mode === 'login' ? 'Σύνδεση' : 'Εγγραφή'}
          </h1>
          <p className={styles.bodyText}>
            {mode === 'login' ? 'Εισάγετε τα στοιχεία σας' : 'Δημιουργήστε τον λογαριασμό σας'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {/* User Type Switch */}
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

            <div className="space-y-1.5">
              <label className={styles.labelUpper}>Κωδικός πρόσβασης</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Τουλάχιστον 6 χαρακτήρες' : 'Εισάγετε τον κωδικό σας'}
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
              {mode === 'login' && (
                <div className="text-right pt-1">
                  <Link href="/forgot-password/" className={`${styles.linkText} text-xs`}>
                    Ξέχασα τον κωδικό μου
                  </Link>
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className={styles.labelUpper}>Επιβεβαίωση κωδικού</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Επαναλάβετε τον κωδικό"
                    required
                    disabled={isLoading}
                    className={`${styles.input} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Icon name={showConfirmPassword ? 'visibility_off' : 'visibility'} size="sm" />
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-error">Οι κωδικοί δεν ταιριάζουν</p>
                )}
              </div>
            )}

            {mode === 'register' && (
              <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <span className="text-xs text-on-surface-variant leading-snug">
                  Έχω διαβάσει και αποδέχομαι τους{' '}
                  <Link href="/terms/" target="_blank" className="text-primary underline">
                    Όρους Χρήσης
                  </Link>
                  {' '}και την{' '}
                  <Link href="/privacy/" target="_blank" className="text-primary underline">
                    Πολιτική Απορρήτου
                  </Link>
                  .
                </span>
              </label>
            )}

            <button
              type="submit"
              className={`${styles.btnPrimary} w-full justify-center text-base py-3 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              <Icon name={mode === 'login' ? 'login' : 'person_add'} size="sm" />
              {isLoading ? 'Παρακαλώ περιμένετε...' : (mode === 'login' ? 'Σύνδεση' : 'Εγγραφή')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setPassword('')
                setConfirmPassword('')
              }}
              className={styles.linkText}
            >
              {mode === 'login' ? 'Δεν έχετε λογαριασμό; Εγγραφείτε' : 'Έχετε λογαριασμό; Συνδεθείτε'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
