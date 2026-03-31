'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useUser } from '@/contexts/UserContext'
import { useAuth } from '@/contexts/AuthContext'
import { styles } from '@/styles/styles'
import { SegmentedControl } from '@/components'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [userType, setUserType] = useState('client')

  const router = useRouter()
  const { success, error } = useToast()
  const { refreshUser } = useUser()
  const { refreshClient, refreshGarage } = useAuth()

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

      if (data.success && data.user) {
        const user = data.user

        if (userType === 'garage') {
          localStorage.removeItem('clientId')
          localStorage.setItem('garageId', user.id)
          await refreshGarage(user.id)
          success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.companyName}!`)
          router.push('/garage-dashboard')
        } else {
          localStorage.removeItem('garageId')
          localStorage.setItem('clientId', user.id)
          await refreshClient(user.id)
          await refreshUser(user.id)
          success('Επιτυχής Σύνδεση', `Καλώς ήρθατε, ${user.firstName}!`)
          router.push(`/requests/${user.id}`)
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

    if (userType === 'garage') {
      router.push('/register-professional')
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
          firstName: email.trim().split('@')[0]
        })
      })

      const data = await response.json()

      if (data.success) {
        localStorage.removeItem('garageId')
        localStorage.setItem('clientId', data.client.id)
        await refreshClient(data.client.id)
        await refreshUser(data.client.id)
        success('Επιτυχής Εγγραφή', 'Ο λογαριασμός σας δημιουργήθηκε!')
        router.push(`/requests/${data.client.id}`)
      } else {
        error('Σφάλμα Εγγραφής', data.error || 'Δεν ήταν δυνατή η εγγραφή')
      }
    } catch {
      error('Σφάλμα Εγγραφής', 'Δεν ήταν δυνατή η εγγραφή. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
            <Icon name={mode === 'login' ? 'login' : 'person_add'} filled className="text-on-primary" size="lg" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">
            {mode === 'login' ? 'Σύνδεση' : 'Εγγραφή'}
          </h1>
          <p className={styles.bodyText}>
            {mode === 'login' ? 'Εισάγετε τα στοιχεία σας' : 'Δημιουργήστε τον λογαριασμό σας'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-5">
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

            <div className="space-y-2">
              <label className={styles.labelUpper}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="π.χ. example@email.com"
                required
                disabled={isLoading}
                className={styles.input}
              />
            </div>

            <div className="space-y-2">
              <label className={styles.labelUpper}>Κωδικός πρόσβασης</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Τουλάχιστον 6 χαρακτήρες' : 'Εισάγετε τον κωδικό σας'}
                required
                disabled={isLoading}
                className={styles.input}
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <label className={styles.labelUpper}>Επιβεβαίωση κωδικού</label>
                <input
                  type="password"
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
            )}

            <button
              type="submit"
              className={`${styles.btnPrimary} w-full justify-center text-base py-3.5 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              <Icon name={mode === 'login' ? 'login' : 'person_add'} size="sm" />
              {isLoading ? 'Παρακαλώ περιμένετε...' : (mode === 'login' ? 'Σύνδεση' : 'Εγγραφή')}
            </button>
          </form>

          <div className="mt-5 text-center">
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

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className={styles.linkText}
          >
            Επιστροφή στην Αρχική
          </button>
        </div>
      </div>
    </div>
  )
}
