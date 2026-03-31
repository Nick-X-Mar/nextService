'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import Icon from '@/components/ui/Icon'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  email: string
  firstName?: string
  onLoginSuccess: (clientId: string) => void
}

export default function LoginModal({ isOpen, onClose, email, firstName, onLoginSuccess }: LoginModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    if (!password || password.length < 6) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, userType: 'client' })
      })

      const result = await response.json()

      if (result.success && result.user) {
        localStorage.setItem('clientId', result.user.id)
        localStorage.setItem('userType', 'client')
        onLoginSuccess(result.user.id)
        onClose()
      } else {
        setError(result.error || 'Σφάλμα σύνδεσης')
      }
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Σύνδεση" size="sm" closeOnBackdropClick>
      <div className="space-y-5">
        <div className="flex items-center gap-3 bg-primary/5 rounded-xl p-4 border border-primary/10">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="person" className="text-primary" size="md" />
          </div>
          <div>
            <p className="text-sm font-bold text-on-surface">
              Καλώς ήρθατε πίσω{firstName ? `, ${firstName}` : ''}!
            </p>
            <p className="text-xs text-on-surface-variant">{email}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
            Κωδικός πρόσβασης
          </label>
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Εισάγετε τον κωδικό σας"
              className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
              autoFocus
            />
            <Icon name="lock" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
          </div>
          {error && (
            <p className="text-xs text-error flex items-center gap-1">
              <Icon name="error" size="sm" className="text-error" /> {error}
            </p>
          )}
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoading || !password}
          className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            !isLoading && password
              ? 'bg-gradient-to-r from-primary to-primary-container text-white active:scale-[0.98]'
              : 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Σύνδεση...
            </>
          ) : (
            <>
              <Icon name="login" size="sm" />
              Σύνδεση
            </>
          )}
        </button>
      </div>
    </Modal>
  )
}
