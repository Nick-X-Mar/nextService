'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useToast } from '@/hooks/useToast'
import { styles } from '@/styles/styles'
import { MERGED_EMAIL_KEY } from '../mergedEmailKey'

type Outcome =
  | { kind: 'idle' }
  | { kind: 'done'; clientId: string }
  | { kind: 'failed'; code?: string; message: string }

const cardClass =
  'bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center'

/**
 * Landing page of the "link my requests to this account" email.
 *
 * Confirms only on a click. Mail scanners open links on arrival, and if one of
 * them could spend the token it would also be the browser that receives the
 * account's session.
 *
 * `?merged=1` is the other end of the same flow: the guest tab that was
 * waiting lands here when the link was opened on another device, and signs in.
 */
export default function ConfirmAccountPage() {
  const searchParams = useSearchParams()
  if (searchParams.get('merged') === '1') return <MergedElsewhere />
  return <ConfirmLink guestId={searchParams.get('g') || ''} token={searchParams.get('t') || ''} />
}

/**
 * Into the account with a full page load. This tab may have been signed in as
 * someone else a moment ago (the guest, in the same browser), and nothing it
 * holds in memory — the realtime socket and token, alert counts — should
 * carry over.
 */
function enterAccount(href: string) {
  window.location.assign(href)
}

function ConfirmLink({ guestId, token }: { guestId: string; token: string }) {
  const { syncSession } = useAuth()
  const { run, isPending } = useAsyncTask()
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const [redirecting, setRedirecting] = useState(false)

  const confirm = () =>
    run(async () => {
      try {
        const res = await fetch('/api/auth/confirm-account/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId, token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) {
          setOutcome({
            kind: 'failed',
            code: data.code,
            message: data.error || 'Δεν ήταν δυνατή η επιβεβαίωση.',
          })
          return
        }
        // The response set this browser's session to the account.
        await syncSession().catch(() => null)
        setOutcome({ kind: 'done', clientId: data.clientId })
      } catch {
        setOutcome({ kind: 'failed', message: 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.' })
      }
    })

  const linkIsMalformed = !guestId || !token

  if (outcome.kind === 'done') {
    const href = `/requests/${outcome.clientId}/`
    return (
      <Shell>
        <div className={cardClass} data-testid="confirm-account-done">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6">
            <Icon name="check_circle" filled className="text-green-600" size="xl" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-on-surface mb-3">Ο λογαριασμός επιβεβαιώθηκε</h1>
          <p className={`${styles.bodyText} mb-6`}>
            Τα αιτήματά σας μεταφέρθηκαν στον λογαριασμό σας και συνδεθήκατε σε αυτή τη συσκευή.
          </p>
          <button
            type="button"
            onClick={() => {
              setRedirecting(true)
              enterAccount(href)
            }}
            disabled={redirecting}
            className={`${styles.btnPrimary} w-full justify-center text-base py-3`}
          >
            {redirecting ? <Spinner size="sm" /> : <Icon name="list_alt" size="sm" />}
            Δείτε τα αιτήματά σας
          </button>
        </div>
      </Shell>
    )
  }

  if (linkIsMalformed || outcome.kind === 'failed') {
    const alreadyUsed = outcome.kind === 'failed' && outcome.code === 'ALREADY_USED'
    return (
      <Shell>
        <div className={cardClass} data-testid="confirm-account-failed">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-error-container mb-6">
            <Icon name={alreadyUsed ? 'task_alt' : 'link_off'} className="text-error" size="xl" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-on-surface mb-3">
            {alreadyUsed ? 'Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί' : 'Ο σύνδεσμος δεν ισχύει'}
          </h1>
          <p className={`${styles.bodyText} mb-6`}>
            {outcome.kind === 'failed'
              ? outcome.message
              : 'Ο σύνδεσμος είναι ελλιπής. Ανοίξτε τον ξανά από το email που λάβατε.'}
          </p>
          <Link href="/login/" className={styles.linkText}>
            Μετάβαση στη σύνδεση
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className={cardClass}>
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-6">
          <Icon name="link" className="text-primary" size="xl" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-on-surface mb-3">Σύνδεση αιτημάτων στον λογαριασμό σας</h1>
        <p className={`${styles.bodyText} mb-2`}>
          Κάποιος ζήτησε να μεταφερθούν σε αυτόν τον λογαριασμό αιτήματα που καταχωρήθηκαν χωρίς σύνδεση.
        </p>
        <p className={`${styles.smallText} mb-6`}>
          Αν δεν το ζητήσατε εσείς, κλείστε αυτή τη σελίδα — ο λογαριασμός σας δεν θα αλλάξει.
        </p>
        <button
          type="button"
          onClick={confirm}
          disabled={isPending()}
          className={`${styles.btnPrimary} w-full justify-center text-base py-3 disabled:opacity-50`}
        >
          {isPending() ? <Spinner size="sm" /> : <Icon name="verified_user" size="sm" />}
          Επιβεβαίωση
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface flex items-start justify-center px-4 pt-8 md:pt-16 pb-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

/** The waiting tab's landing: its guest session is gone, the account is the way in. */
function MergedElsewhere() {
  const { syncSession } = useAuth()
  const { error } = useToast()
  const { run, isPending } = useAsyncTask()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem(MERGED_EMAIL_KEY) || '')
    } catch {
      // Not prefilled — the user types it.
    }
  }, [])

  const login = () =>
    run(async () => {
      try {
        const res = await fetch('/api/auth/login/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, userType: 'client' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) {
          error('Σφάλμα σύνδεσης', data.error || 'Λάθος email ή κωδικός πρόσβασης')
          return
        }
        try {
          sessionStorage.removeItem(MERGED_EMAIL_KEY)
        } catch {
          // ignore
        }
        const identity = await syncSession().catch(() => null)
        setRedirecting(true)
        enterAccount(`/requests/${identity?.id || data.user?.id}/`)
      } catch {
        error('Σφάλμα', 'Δεν ήταν δυνατή η επικοινωνία. Δοκιμάστε ξανά.')
      }
    })

  return (
    <Shell>
      <div className={cardClass} data-testid="guest-merge-confirmed">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-50 mb-6">
          <Icon name="verified" filled className="text-green-600" size="xl" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-on-surface mb-3">Ο λογαριασμός επιβεβαιώθηκε</h1>
        <p className={`${styles.bodyText} mb-6`}>
          Τα αιτήματά σας μεταφέρθηκαν στον λογαριασμό σας. Συνδεθείτε για να τα δείτε.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (email && password) login()
          }}
          className="space-y-4 text-left"
        >
          <div className="space-y-1.5">
            <label className={styles.labelUpper} htmlFor="merged-login-email">Email</label>
            <input
              id="merged-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className={styles.labelUpper} htmlFor="merged-login-password">Κωδικός πρόσβασης</label>
            <input
              id="merged-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isPending() || redirecting || !email || !password}
            className={`${styles.btnPrimary} w-full justify-center text-base py-3 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPending() || redirecting ? <Spinner size="sm" /> : <Icon name="login" size="sm" />}
            Σύνδεση
          </button>
        </form>
        <div className="mt-4">
          <Link href="/forgot-password/" className={styles.linkText}>
            Ξεχάσατε τον κωδικό;
          </Link>
        </div>
      </div>
    </Shell>
  )
}
