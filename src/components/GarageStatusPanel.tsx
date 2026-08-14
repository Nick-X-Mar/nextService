'use client'

import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'

interface GarageStatusPanelProps {
  /** 'pending' = waiting for admin validation, 'approved' = activated */
  status: 'pending' | 'approved'
  companyName?: string
  email?: string
  /** Shown right after the registration form is submitted */
  justRegistered?: boolean
  /** Manual "check again" — the panel also polls on its own */
  onCheck?: () => void
  isChecking?: boolean
  onEnter?: () => void
  onLogout?: () => void
}

const pendingSteps = [
  { icon: 'fact_check', text: 'Ελέγχουμε τα στοιχεία της εταιρείας σας (ΑΦΜ, ΔΟΥ, διεύθυνση).' },
  { icon: 'mail', text: 'Μόλις εγκριθείτε, θα λάβετε email ενεργοποίησης.' },
  { icon: 'list_alt', text: 'Μετά την έγκριση βλέπετε τα αιτήματα της περιοχής σας και στέλνετε προσφορές.' },
]

/**
 * The single place a garage sees where its application stands. Rendered on
 * /register-professional and on the dashboard, so a pending or freshly
 * approved garage never lands back on an empty registration form.
 */
export default function GarageStatusPanel({
  status,
  companyName,
  email,
  justRegistered = false,
  onCheck,
  isChecking = false,
  onEnter,
  onLogout,
}: GarageStatusPanelProps) {
  const isApproved = status === 'approved'

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 text-center">
        <div
          className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${
            isApproved ? 'bg-green-50' : 'bg-amber-50'
          }`}
        >
          <Icon
            name={isApproved ? 'verified' : 'hourglass_top'}
            filled
            size="xl"
            className={isApproved ? 'text-green-600' : 'text-amber-600'}
          />
        </div>

        <p className={`${styles.labelUpper} mb-2`}>
          {isApproved ? 'Λογαριασμός ενεργός' : 'Αίτηση υπό έλεγχο'}
        </p>

        <h2 className="text-2xl font-black tracking-tight text-on-surface mb-3">
          {isApproved
            ? 'Ο λογαριασμός σας εγκρίθηκε!'
            : justRegistered
              ? 'Η εγγραφή ολοκληρώθηκε!'
              : 'Η αίτησή σας εξετάζεται'}
        </h2>

        {companyName && (
          <p className={`${styles.bodyText} mb-1`}>
            <strong className="text-on-surface">{companyName}</strong>
          </p>
        )}
        {email && <p className={`${styles.smallText} mb-6`}>{email}</p>}

        <p className={`${styles.bodyText} mb-6`}>
          {isApproved
            ? 'Το συνεργείο σας είναι πλέον ενεργό. Μπορείτε να δείτε τα αιτήματα των πελατών και να στείλετε τις πρώτες σας προσφορές.'
            : 'Η ομάδα μας ελέγχει τα στοιχεία σας. Δεν χρειάζεται να κάνετε κάτι άλλο — θα ενημερωθείτε με email και σε αυτή τη σελίδα μόλις ενεργοποιηθεί ο λογαριασμός σας.'}
        </p>

        {!isApproved && (
          <div className="bg-surface-container-low rounded-xl p-5 mb-6 text-left space-y-4">
            <p className={styles.labelUpper}>Τι ακολουθεί</p>
            {pendingSteps.map((step) => (
              <div key={step.icon} className="flex items-start gap-3">
                <Icon name={step.icon} size="sm" className="text-primary mt-0.5" />
                <p className="text-sm text-secondary leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {isApproved && onEnter && (
            <button onClick={onEnter} className={`${styles.btnPrimary} w-full justify-center py-3.5`}>
              <Icon name="dashboard" size="sm" />
              Μετάβαση στον πίνακα ελέγχου
            </button>
          )}

          {!isApproved && onCheck && (
            <button
              onClick={onCheck}
              disabled={isChecking}
              className={`${styles.btnOutline} w-full justify-center py-3.5 ${isChecking ? 'opacity-60' : ''}`}
            >
              <Icon name={isChecking ? 'progress_activity' : 'refresh'} size="sm" className={isChecking ? 'animate-spin' : ''} />
              {isChecking ? 'Έλεγχος...' : 'Έλεγχος κατάστασης'}
            </button>
          )}

          {onLogout && (
            <button onClick={onLogout} className={`${styles.btnOutline} w-full justify-center py-3.5`}>
              <Icon name="logout" size="sm" />
              Αποσύνδεση
            </button>
          )}
        </div>

        {!isApproved && (
          <p className={`${styles.smallText} mt-5`}>
            Η σελίδα ενημερώνεται αυτόματα μόλις εγκριθεί η αίτησή σας.
          </p>
        )}
      </div>
    </div>
  )
}
