'use client'

import { useState, useEffect, useCallback } from 'react'
import Icon from '@/components/ui/Icon'
import LoginModal from '@/components/LoginModal'
import { useAuth } from '@/contexts/AuthContext'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { adoptFormData } from '@/utils/formStorage'
import { countryList, DEFAULT_COUNTRY, dialCodeOf, toE164 } from '@/utils/phone'

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
  // Optional. Only the garage the client books with ever sees it.
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const phoneNumber = phone.trim() ? toE164(phoneCountry, phone) : ''
  const isPhoneValid = phoneNumber !== null
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
    (isLoggedIn || (isEmailValid(email) && !emailExists && isPasswordValid && isPhoneValid && acceptedTerms))

  /** The fields the request body needs: none for a signed-in client. */
  const credentials = isLoggedIn
    ? {}
    : { email, password, acceptedTerms: true as const, ...(phoneNumber ? { phoneNumber } : {}) }

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
    phoneCountry, setPhoneCountry, phone, setPhone, isPhoneValid,
  }
}

export type GuestAccount = ReturnType<typeof useGuestAccount>

export default function GuestAccountFields({ account }: { account: GuestAccount }) {
  const {
    authSettled, isLoggedIn, onSignedIn,
    email, changeEmail, password, setPassword, confirmPassword, setConfirmPassword,
    acceptedTerms, setAcceptedTerms, emailExists, isCheckingEmail, showEmailHint, setShowEmailHint,
    showLoginModal, setShowLoginModal,
    phoneCountry, setPhoneCountry, phone, setPhone, isPhoneValid,
  } = account
  // A garage session counts as signed out here: submitting registers a client
  // and the new client cookie replaces the garage's. Say so before it happens.
  const { userType } = useAuth()

  return (
    <>
      {authSettled && !isLoggedIn && (
        <div className="space-y-5">
          {userType === 'garage' && (
            <div className="bg-tertiary/10 border border-tertiary/20 rounded-xl p-3 flex items-start gap-2">
              <Icon name="info" size="sm" className="text-tertiary mt-0.5 shrink-0" />
              <p className="text-xs text-on-surface-variant">
                Είστε συνδεδεμένοι ως <span className="font-bold text-on-surface">συνεργείο</span>. Με την αποστολή θα δημιουργηθεί λογαριασμός πελάτη με αυτό το email και θα αποσυνδεθείτε από το συνεργείο.
              </p>
            </div>
          )}
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
              <PhoneField
                country={phoneCountry}
                onCountryChange={setPhoneCountry}
                value={phone}
                onChange={setPhone}
                invalid={!isPhoneValid}
              />

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

/**
 * Optional mobile with its own country picker. The native <select> sits invisibly
 * over a compact "🇬🇷 +30" label, so the phone's own picker opens with every
 * country's full name while the field stays narrow.
 */
function PhoneField({
  country, onCountryChange, value, onChange, invalid,
}: {
  country: string
  onCountryChange: (iso: string) => void
  value: string
  onChange: (value: string) => void
  invalid: boolean
}) {
  const selected = countryList().find((c) => c.iso === country)

  return (
    <div className="space-y-3">
      <div className="bg-primary-fixed/40 border border-primary/10 rounded-xl p-4 flex items-start gap-3">
        <Icon name="phone_iphone" className="text-primary shrink-0" />
        <div>
          <p className="text-sm font-bold text-on-surface">Θέλεις πιο άμεση επικοινωνία;</p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Δήλωσε το κινητό σου, ώστε το συνεργείο να μπορεί να σε καλέσει για το ραντεβού. Το βλέπει μόνο το
            συνεργείο που θα επιλέξεις, αφού κλείσεις ραντεβού.
          </p>
        </div>
      </div>
      <label htmlFor="guest-phone" className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
        Κινητό <span className="normal-case tracking-normal font-medium">(προαιρετικό)</span>
      </label>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <div
            aria-hidden="true"
            className="h-full bg-surface-container-highest rounded-xl px-3 flex items-center gap-1.5 font-medium text-on-surface"
          >
            <span>{selected?.flag}</span>
            <span>+{dialCodeOf(country)}</span>
            <Icon name="expand_more" size="sm" className="text-on-surface-variant/60" />
          </div>
          <select
            aria-label="Χώρα κινητού"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {countryList().map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
        <input
          id="guest-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d\s+()-]/g, ''))}
          placeholder={country === 'GR' ? 'π.χ. 6912345678' : 'Αριθμός κινητού'}
          className="min-w-0 flex-1 bg-surface-container-highest border-none rounded-xl px-4 py-4 font-medium text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>
      {invalid && (
        <p className="text-xs text-error flex items-center gap-1">
          <Icon name="error" size="sm" className="text-error" />
          {country === 'GR' ? 'Το κινητό ξεκινά από 69 και έχει 10 ψηφία' : 'Μη έγκυρος αριθμός κινητού'}
        </p>
      )}
    </div>
  )
}
