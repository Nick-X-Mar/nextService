'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/Modal'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import { MIN_PASSWORD_LENGTH } from '@/utils/passwordPolicy'
import { MERGED_EMAIL_KEY } from '@/app/confirm-account/mergedEmailKey'

/**
 * The requests page as seen by a guest — a session whose Clients row has no
 * email or password (created by the old funnel, before inline registration).
 *
 * Either the guest finishes registering with a free email, or, when the email
 * already has an account, proves that account is theirs — by its password, or
 * by a link sent to its inbox — and the requests move across. Nothing ever
 * moves on the strength of an email address alone.
 */

type Phase = 'intro' | 'form' | 'waiting'
type MergeStatus = 'pending' | 'expired'

const POLL_INTERVAL_MS = 4000
const pendingEmailKey = (guestId: string) => `guestMergeEmail:${guestId}`

function readPendingEmail(guestId: string): string {
  try {
    return localStorage.getItem(pendingEmailKey(guestId)) || ''
  } catch {
    return ''
  }
}

function writePendingEmail(guestId: string, email: string | null) {
  try {
    if (email) localStorage.setItem(pendingEmailKey(guestId), email)
    else localStorage.removeItem(pendingEmailKey(guestId))
  } catch {
    // Private mode — the waiting card just can't name the address after a reload.
  }
}

const isEmailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

interface GuestAccountPanelProps {
  guestId: string
  /** Registration finished on this same row — the page can treat the user as registered. */
  onRegistered: () => void
  /** The guest session is over (its requests now live in an account). */
  onSessionEnded: () => void
}

export default function GuestAccountPanel({ guestId, onRegistered, onSessionEnded }: GuestAccountPanelProps) {
  const { syncSession } = useAuth()
  const { success, error, info } = useToast()
  const { run, isPending } = useAsyncTask()

  const [phase, setPhase] = useState<Phase>('intro')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  })
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // The "this email already has an account" dialog.
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeEmail, setMergeEmail] = useState('')
  const [mergePassword, setMergePassword] = useState('')
  const [mergeIsTaken, setMergeIsTaken] = useState(false)

  const [waitStatus, setWaitStatus] = useState<MergeStatus>('pending')
  const [pendingEmail, setPendingEmail] = useState('')
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null)

  // The parent passes fresh closures on every render; holding them in refs
  // keeps the status check below from re-running each time it does.
  const onRegisteredRef = useRef(onRegistered)
  onRegisteredRef.current = onRegistered
  const onSessionEndedRef = useRef(onSessionEnded)
  onSessionEndedRef.current = onSessionEnded

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  /**
   * The account is now this browser's session: go to its requests.
   *
   * A full load, not a router push. Everything this tab holds in memory was
   * built for the guest — the realtime socket and its token, the alert
   * counts, the cached request list — and none of it should follow the user
   * into the account.
   */
  const enterAccount = useCallback(
    (accountId: string, message: string) => {
      writePendingEmail(guestId, null)
      success('Τα αιτήματα μεταφέρθηκαν', message)
      const href = `/requests/${accountId}/`
      setRedirectingTo(href)
      window.location.assign(href)
    },
    [guestId, success]
  )

  /**
   * The merge happened somewhere. If the link was opened in this browser the
   * cookie is already the account's; otherwise the guest session is spent and
   * the user signs in to the account themselves.
   */
  const resolveMerged = useCallback(async () => {
    let identity: Awaited<ReturnType<typeof syncSession>> = null
    try {
      identity = await syncSession()
    } catch {
      return // offline — the next poll tries again
    }
    if (identity?.userType === 'client' && identity.id !== guestId) {
      enterAccount(identity.id, 'Συνδεθήκατε στον λογαριασμό σας.')
      return
    }
    // Still this row and still signed in: it was registered from another tab
    // rather than merged, so there is nothing to sign out of.
    if (identity?.id === guestId) {
      writePendingEmail(guestId, null)
      onRegisteredRef.current()
      return
    }
    try {
      await fetch('/api/auth/logout/', { method: 'POST' })
    } catch {
      // The tombstoned session is already refused by /api/auth/me.
    }
    // Sign-in happens on a public page: this one sits behind the session that
    // was just dropped, so any refetch of it would bounce to /login/ mid-form.
    const email = readPendingEmail(guestId)
    writePendingEmail(guestId, null)
    try {
      if (email) sessionStorage.setItem(MERGED_EMAIL_KEY, email)
    } catch {
      // The form just won't be prefilled.
    }
    onSessionEndedRef.current()
    // A full load, not a router push: this tab's session is gone, and nothing
    // it still holds in memory (contexts, the realtime socket) should follow.
    setRedirectingTo('/confirm-account/?merged=1')
    window.location.assign('/confirm-account/?merged=1')
  }, [enterAccount, guestId, syncSession])

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/register-from-requests/status/', { cache: 'no-store' })
      // 403: this browser is signed in as somebody other than the guest now —
      // the confirmation link was opened right here.
      if (res.status === 403 || res.status === 401) {
        await resolveMerged()
        return
      }
      if (!res.ok) return
      const { status } = await res.json()
      if (status === 'merged') {
        await resolveMerged()
      } else if (status === 'pending' || status === 'expired') {
        setWaitStatus(status)
        setPhase('waiting')
      }
    } catch {
      // Transient — polling continues.
    }
  }, [resolveMerged])

  const checkRef = useRef(checkStatus)
  checkRef.current = checkStatus

  // A reload must not lose a link that is already on its way.
  useEffect(() => {
    setPendingEmail(readPendingEmail(guestId))
    checkRef.current()
  }, [guestId])

  // Poll while waiting, visible tabs only, and immediately on return to the tab.
  useEffect(() => {
    if (phase !== 'waiting') return
    const tick = () => {
      if (document.visibilityState === 'visible') checkRef.current()
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [phase])

  const openMerge = (email: string, taken: boolean) => {
    setMergeEmail(email)
    setMergeIsTaken(taken)
    setMergePassword('')
    setMergeOpen(true)
  }

  const passwordsOk =
    form.password.length >= MIN_PASSWORD_LENGTH && form.password === form.confirmPassword
  const canSubmit = isEmailValid(form.email) && passwordsOk && acceptedTerms

  const submitRegistration = () =>
    run('register', async () => {
      try {
        const res = await fetch('/api/auth/register-from-requests/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            acceptedTerms,
            firstName: form.firstName,
            lastName: form.lastName,
            phoneNumber: form.phoneNumber,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data.code === 'EMAIL_EXISTS') {
          openMerge(form.email.trim().toLowerCase(), true)
          return
        }
        if (res.status === 409 && data.code === 'ALREADY_MERGED') {
          await resolveMerged()
          return
        }
        if (!res.ok) {
          error('Σφάλμα', data.error || 'Δεν ήταν δυνατή η εγγραφή')
          return
        }
        await syncSession().catch(() => null)
        success('Η εγγραφή ολοκληρώθηκε', 'Από εδώ και πέρα θα λαμβάνετε ειδοποιήσεις για τα αιτήματά σας.')
        onRegisteredRef.current()
      } catch {
        error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
      }
    })

  const mergeWithPassword = () =>
    run('merge-password', async () => {
      try {
        const res = await fetch('/api/auth/register-from-requests/merge-with-password/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: mergeEmail, password: mergePassword }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data.code === 'ALREADY_MERGED') {
          setMergeOpen(false)
          await resolveMerged()
          return
        }
        if (!res.ok || !data.client?.id) {
          error('Σφάλμα', data.error || 'Δεν ήταν δυνατή η σύνδεση')
          return
        }
        setMergeOpen(false)
        await syncSession().catch(() => null)
        enterAccount(
          data.client.id,
          data.vehicleDeduplicated
            ? 'Συνδεθήκατε και τα οχήματά σας ενώθηκαν με τα υπάρχοντα.'
            : 'Συνδεθήκατε στον λογαριασμό σας.'
        )
      } catch {
        error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
      }
    })

  const sendConfirmation = (email: string) =>
    run('send-email', async () => {
      try {
        const res = await fetch('/api/auth/register-from-requests/send-confirmation/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 && data.code === 'ALREADY_MERGED') {
          setMergeOpen(false)
          await resolveMerged()
          return
        }
        // The requests are moving into this account as we speak (the link was
        // just opened, maybe elsewhere). Wait with the status poll, which
        // takes the tab into the account the moment it finishes.
        if (res.status === 409 && data.code === 'MERGE_RUNNING') {
          setMergeOpen(false)
          info('Σε εξέλιξη', data.error)
          setWaitStatus('pending')
          setPhase('waiting')
          return
        }
        if (!res.ok) {
          error('Δεν στάλθηκε', data.error || 'Δεν ήταν δυνατή η αποστολή του email')
          return
        }
        const normalized = email.trim().toLowerCase()
        writePendingEmail(guestId, normalized)
        setPendingEmail(normalized)
        setWaitStatus('pending')
        setMergeOpen(false)
        setPhase('waiting')
      } catch {
        error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
      }
    })

  if (redirectingTo) {
    return (
      <div className={`${styles.card} flex items-center gap-3 mb-6`}>
        <Spinner size="sm" className="text-primary" />
        <p className="text-sm font-bold text-on-surface">Μεταφορά…</p>
      </div>
    )
  }

  return (
    <div className="mb-6">
      {phase === 'waiting' ? (
        <div className={`${styles.card} border-primary/20`} data-testid="guest-merge-waiting">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name={waitStatus === 'expired' ? 'timer_off' : 'mark_email_unread'} filled className="text-primary" size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              {waitStatus === 'expired' ? (
                <>
                  <p className="text-base font-bold text-on-surface mb-1">Ο σύνδεσμος έληξε</p>
                  <p className="text-sm text-on-surface-variant mb-4">
                    Ο σύνδεσμος επιβεβαίωσης ισχύει για 1 ώρα. Ζητήστε νέο για να μεταφερθούν τα αιτήματά σας.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-on-surface mb-1">Ελέγξτε το email σας</p>
                  <p className="text-sm text-on-surface-variant mb-3">
                    Στείλαμε σύνδεσμο επιβεβαίωσης στο{' '}
                    <strong className="text-on-surface break-all">{pendingEmail || 'email του λογαριασμού σας'}</strong>.
                    Ανοίξτε τον, σε αυτή ή σε άλλη συσκευή, για να μεταφερθούν τα αιτήματά σας στον λογαριασμό.
                    Ο σύνδεσμος ισχύει για 1 ώρα.
                  </p>
                  <p className="text-xs font-bold text-primary flex items-center gap-2 mb-4">
                    <Spinner size="sm" />
                    Περιμένουμε την επιβεβαίωση…
                  </p>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                {pendingEmail && (
                  <button
                    type="button"
                    onClick={() => sendConfirmation(pendingEmail)}
                    disabled={isPending('send-email')}
                    className={`${waitStatus === 'expired' ? styles.btnPrimary : styles.btnOutline} justify-center disabled:opacity-50`}
                  >
                    {isPending('send-email') ? <Spinner size="sm" /> : <Icon name="forward_to_inbox" size="sm" />}
                    {waitStatus === 'expired' ? 'Αποστολή νέου συνδέσμου' : 'Αποστολή ξανά'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openMerge(pendingEmail, true)}
                  className={`${styles.btnGhost} justify-center`}
                >
                  <Icon name="key" size="sm" />
                  Σύνδεση με κωδικό
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${styles.card} border-primary/20`} data-testid="guest-registration">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="notifications_active" filled className="text-primary" size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-on-surface mb-1">Εγγραφείτε για ειδοποιήσεις</p>
              <p className="text-sm text-on-surface-variant mb-4">
                Ως επισκέπτης βλέπετε τα αιτήματά σας, αλλά για να λαμβάνετε{' '}
                <span className="text-primary font-bold">ειδοποιήσεις και ενημερώσεις από τα συνεργεία</span>{' '}
                ολοκληρώστε την εγγραφή σας.
              </p>

              {phase === 'intro' ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={() => setPhase('form')} className={styles.btnPrimary}>
                    <Icon name="person_add" size="sm" />
                    Ολοκλήρωση εγγραφής
                  </button>
                  <button type="button" onClick={() => openMerge('', false)} className={styles.btnOutline}>
                    <Icon name="login" size="sm" />
                    Έχω ήδη λογαριασμό
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (canSubmit) submitRegistration()
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className={styles.label} htmlFor="guest-first-name">Όνομα</label>
                      <input
                        id="guest-first-name"
                        type="text"
                        value={form.firstName}
                        onChange={(e) => updateField('firstName', e.target.value)}
                        className={styles.input}
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.label} htmlFor="guest-last-name">Επώνυμο</label>
                      <input
                        id="guest-last-name"
                        type="text"
                        value={form.lastName}
                        onChange={(e) => updateField('lastName', e.target.value)}
                        className={styles.input}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.label} htmlFor="guest-email">
                      Email <span className="text-tertiary">*</span>
                    </label>
                    <input
                      id="guest-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className={styles.input}
                      placeholder="example@email.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={styles.label} htmlFor="guest-phone">Τηλέφωνο</label>
                    <input
                      id="guest-phone"
                      type="tel"
                      value={form.phoneNumber}
                      onChange={(e) => updateField('phoneNumber', e.target.value)}
                      className={styles.input}
                      placeholder="6912345678"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className={styles.label} htmlFor="guest-password">
                        Κωδικός <span className="text-tertiary">*</span>
                      </label>
                      <input
                        id="guest-password"
                        type="password"
                        value={form.password}
                        onChange={(e) => updateField('password', e.target.value)}
                        className={styles.input}
                        placeholder={`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={styles.label} htmlFor="guest-password-confirm">
                        Επιβεβαίωση κωδικού <span className="text-tertiary">*</span>
                      </label>
                      <input
                        id="guest-password-confirm"
                        type="password"
                        value={form.confirmPassword}
                        onChange={(e) => updateField('confirmPassword', e.target.value)}
                        className={styles.input}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="text-xs text-error">Οι κωδικοί δεν ταιριάζουν</p>
                  )}
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded text-primary focus:ring-primary"
                    />
                    <span className="text-xs text-on-surface-variant leading-snug">
                      Έχω διαβάσει και αποδέχομαι τους{' '}
                      <a href="/terms/" target="_blank" rel="noreferrer" className="text-primary underline">
                        Όρους Χρήσης
                      </a>{' '}
                      και την{' '}
                      <a href="/privacy/" target="_blank" rel="noreferrer" className="text-primary underline">
                        Πολιτική Απορρήτου
                      </a>
                      .
                    </span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={!canSubmit || isPending('register')}
                      className={`${styles.btnPrimary} flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isPending('register') ? <Spinner size="sm" /> : <Icon name="how_to_reg" size="sm" />}
                      Ολοκλήρωση εγγραφής
                    </button>
                    <button type="button" onClick={() => setPhase('intro')} className={`${styles.btnOutline} justify-center`}>
                      Ακύρωση
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title={mergeIsTaken ? 'Υπάρχει ήδη λογαριασμός' : 'Σύνδεση με τον λογαριασμό σας'}
        size="md"
      >
        <div className="space-y-5" data-testid="guest-merge-modal">
          <p className="text-sm text-on-surface-variant">
            {mergeIsTaken
              ? 'Αυτό το email ανήκει ήδη σε λογαριασμό. Επιβεβαιώστε ότι είναι δικός σας και τα αιτήματά σας θα μεταφερθούν σε αυτόν.'
              : 'Επιβεβαιώστε ότι ο λογαριασμός είναι δικός σας και τα αιτήματά σας θα μεταφερθούν σε αυτόν.'}
          </p>

          <div className="space-y-1.5">
            <label className={styles.label} htmlFor="merge-email">Email λογαριασμού</label>
            <input
              id="merge-email"
              type="email"
              value={mergeEmail}
              onChange={(e) => setMergeEmail(e.target.value)}
              className={styles.input}
              autoComplete="email"
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (isEmailValid(mergeEmail) && mergePassword) mergeWithPassword()
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label className={styles.label} htmlFor="merge-password">Κωδικός λογαριασμού</label>
              <input
                id="merge-password"
                type="password"
                value={mergePassword}
                onChange={(e) => setMergePassword(e.target.value)}
                className={styles.input}
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="submit"
                disabled={!isEmailValid(mergeEmail) || !mergePassword || isPending('merge-password')}
                className={`${styles.btnPrimary} justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isPending('merge-password') ? <Spinner size="sm" /> : <Icon name="key" size="sm" />}
                Σύνδεση με κωδικό
              </button>
              <Link href="/forgot-password/" className={`${styles.linkText} text-sm`}>
                Ξεχάσατε τον κωδικό;
              </Link>
            </div>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-outline-variant/30" />
            <span className={styles.labelUpper}>ή</span>
            <div className="h-px flex-1 bg-outline-variant/30" />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Θα στείλουμε έναν σύνδεσμο επιβεβαίωσης στο email του λογαριασμού. Τα αιτήματα μεταφέρονται μόλις τον ανοίξετε.
            </p>
            <button
              type="button"
              onClick={() => sendConfirmation(mergeEmail)}
              disabled={!isEmailValid(mergeEmail) || isPending('send-email')}
              className={`${styles.btnOutline} w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isPending('send-email') ? <Spinner size="sm" /> : <Icon name="forward_to_inbox" size="sm" />}
              Στείλε μου email επιβεβαίωσης
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
