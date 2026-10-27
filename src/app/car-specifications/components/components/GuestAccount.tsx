'use client'

import { useState, useEffect, useCallback } from 'react'
import Icon from '@/components/ui/Icon'
import LoginModal from '@/components/LoginModal'
import { useAuth } from '@/contexts/AuthContext'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { adoptFormData } from '@/utils/formStorage'

const isEmailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/**
 * The inline sign-up a guest goes through on the last step of a request, shared by the
 * mechanical (CarSpecsForm) and bodywork (BodyWorkPhotosForm) forms. Bodywork used to
 * submit from step 1 with no credentials at all, so a guest could never send one.
 *
 * Whether to submit as an existing account or register a new one is derived from the
 * server-confirmed session only — the old `localStorage.getItem('clientId')` check hid
 * these fields for a signed-out visitor whose browser still remembered someone else,
 * and the request went to that account.
 */
export function useGuestAccount() {
  const { refreshClient, client, isVerified } = useAuth()
  // Set by the inline LoginModal or by a successful registering submit, whose
  // refreshClient() lands a tick later.
  const [justSignedIn, setJustSignedIn] = useState(false)
  const authSettled = isVerified || justSignedIn
  const isLoggedIn = justSignedIn || (isVerified && !!client)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [showEmailHint, setShowEmailHint] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword

  // Live hint only. It fails open (a 429 or 500 reads as "free"), which is fine
  // because the submit itself answers 409 for a taken email — see onEmailTaken.
  const checkEmail = useCallback(async (emailToCheck: string) => {
    if (!isEmailValid(emailToCheck)) return
    setIsCheckingEmail(true)
    try {
      const res = await fetch('/api/auth/check-email/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck, userType: 'client' })
      })
      // An error (429, 500) says nothing about the address — keep what we knew,
      // including a 409 the submit itself just reported.
      if (!res.ok) return
      const data = await res.json()
      setEmailExists(data.exists === true)
    } catch {
      setEmailExists(false)
    } finally {
      setIsCheckingEmail(false)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn || !isEmailValid(email)) {
      setEmailExists(false)
      return
    }
    const timer = setTimeout(() => checkEmail(email), 800)
    return () => clearTimeout(timer)
  }, [email, isLoggedIn, checkEmail])

  /** Until the session is settled we don't know which shape the submit takes. */
  const isReady = authSettled &&
    (isLoggedIn || (isEmailValid(email) && !emailExists && isPasswordValid && acceptedTerms))

  /** The fields the request body needs: none for a signed-in client. */
  const credentials = isLoggedIn ? {} : { email, password, acceptedTerms: true as const }

  // A different address is a fresh question; the old answer (possibly a 409) no
  // longer applies to it.
  const changeEmail = useCallback((value: string) => {
    setEmail(value)
    setEmailExists(false)
  }, [])

  /** The API answered 409: the address has an account after all. Offer the login. */
  const onEmailTaken = useCallback(() => {
    setEmailExists(true)
    setShowLoginModal(true)
  }, [])

  /** This browser now holds a client session — registered by the submit, or the login modal. */
  const onSignedIn = useCallback((clientId: string) => {
    setJustSignedIn(true)
    // The draft on screen was typed by the person who just signed in, so it stays
    // theirs rather than being treated as a stranger's (see claimFormData). After a
    // registering submit the draft is already gone, and this writes nothing.
    adoptFormData(clientId)
    try {
      localStorage.removeItem('garageId')
      localStorage.setItem('clientId', clientId)
      localStorage.setItem('userType', 'client')
    } catch {
      // Storage refused (private mode, quota): the cookie session is what counts.
    }
    void refreshClient(clientId)
  }, [refreshClient])

  return {
    authSettled, isLoggedIn, isReady, credentials, onEmailTaken, onSignedIn,
    // For GuestAccountFields
    email, changeEmail, password, setPassword, confirmPassword, setConfirmPassword,
    acceptedTerms, setAcceptedTerms, emailExists, isCheckingEmail, showEmailHint, setShowEmailHint,
    showLoginModal, setShowLoginModal,
  }
}

export type GuestAccount = ReturnType<typeof useGuestAccount>

export default function GuestAccountFields({ account }: { account: GuestAccount }) {
  const {
    authSettled, isLoggedIn, onSignedIn,
    email, changeEmail, password, setPassword, confirmPassword, setConfirmPassword,
    acceptedTerms, setAcceptedTerms, emailExists, isCheckingEmail, showEmailHint, setShowEmailHint,
    showLoginModal, setShowLoginModal,
  } = account

  return (
    <>
      {authSettled && !isLoggedIn && (
        <div className="space-y-5">
          {/* Email */}
          <div className="space-y-3">
            <label htmlFor="guest-email" className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
              Email <span className="text-error">*</span>
            </label>
            <div className="relative">
              <input
                id="guest-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  const raw = e.target.value
                  const clean = raw.replace(/[^a-zA-Z0-9@._+\-]/g, '')
                  if (clean !== email) changeEmail(clean)
                  setShowEmailHint(raw.length !== clean.length)
                }}
                placeholder="π.χ. example@email.com"
                className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <Icon name={isCheckingEmail ? 'progress_activity' : 'mail'} className={`absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 ${isCheckingEmail ? 'animate-spin' : ''}`} size="md" />
            </div>
            {showEmailHint && (
              <p className="text-xs text-error flex items-center gap-1">
                <Icon name="keyboard" size="sm" /> Χρησιμοποίησε λατινικούς χαρακτήρες — γύρισε το πληκτρολόγιο σε Αγγλικά.
              </p>
            )}
            {email && !isEmailValid(email) && (
              <p className="text-xs text-error flex items-center gap-1">
                <Icon name="error" size="sm" className="text-error" /> Μη έγκυρη διεύθυνση email
              </p>
            )}
            {emailExists && (
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
                <p className="text-sm text-on-surface">
                  Αυτό το email χρησιμοποιείται ήδη. Συνδεθείτε για να συνεχίσετε.
                </p>
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="w-full h-10 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Icon name="login" size="sm" />
                  Σύνδεση
                </button>
              </div>
            )}
          </div>

          {/* Password fields - only if email is valid and doesn't exist */}
          {isEmailValid(email) && !emailExists && (
            <>
              <div className="space-y-3">
                <label htmlFor="guest-password" className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                  Κωδικός πρόσβασης <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    id="guest-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`}
                    className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <Icon name="lock" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
                </div>
                {password && password.length < MIN_PASSWORD_LENGTH && (
                  <p className="text-xs text-error flex items-center gap-1">
                    <Icon name="error" size="sm" className="text-error" /> Τουλάχιστον {MIN_PASSWORD_LENGTH} χαρακτήρες
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <label htmlFor="guest-password-confirm" className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
                  Επιβεβαίωση κωδικού <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    id="guest-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Επαναλάβετε τον κωδικό"
                    className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-4 pr-12 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <Icon name="lock" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" size="md" />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-error flex items-center gap-1">
                    <Icon name="error" size="sm" className="text-error" /> Οι κωδικοί δεν ταιριάζουν
                  </p>
                )}
                {confirmPassword && password === confirmPassword && password.length >= MIN_PASSWORD_LENGTH && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Icon name="check_circle" size="sm" className="text-green-600" /> Θα δημιουργηθεί ο λογαριασμός σας κατά την υποβολή
                  </p>
                )}
              </div>

              {/* Consent — required for GDPR */}
              <label className="flex items-start gap-2 cursor-pointer select-none pt-2">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <span className="text-xs text-on-surface-variant leading-snug">
                  Έχω διαβάσει και αποδέχομαι τους{' '}
                  <a href="/terms/" target="_blank" rel="noreferrer" className="text-primary underline">
                    Όρους Χρήσης
                  </a>
                  {' '}και την{' '}
                  <a href="/privacy/" target="_blank" rel="noreferrer" className="text-primary underline">
                    Πολιτική Απορρήτου
                  </a>
                  .
                </span>
              </label>
            </>
          )}
        </div>
      )}

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        email={email}
        onLoginSuccess={(clientId) => {
          // Sync the global AuthContext so the header (and any other consumer of
          // useAuth) immediately reflects the logged-in state. Without this the
          // header keeps showing "Σύνδεση" until reload.
          onSignedIn(clientId)
        }}
      />
    </>
  )
}
