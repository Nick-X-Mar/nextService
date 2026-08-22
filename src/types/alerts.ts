/**
 * A standing notification: something happened without the user, and it is still
 * waiting on them.
 *
 * Deliberately one flat shape for every kind. The alternative — a bespoke banner
 * component per notification — is how an app ends up with five pollers and five
 * slightly different banners. The server decides what is pending and how to word
 * it; the client renders whatever it is handed.
 */
export interface Alert {
  /** Stable across polls so React keys and dismissals behave. */
  id: string
  kind:
    | 'messages'
    | 'new-offers'
    | 'appointment-soon'
    | 'deposit-due'
    | 'offer-accepted'
    | 'client-dates'
    | 'profile-incomplete'
    /** Garage: an appointment has passed and nobody has said what happened. */
    | 'completion-due'
    /** Either side: the job is closed and their review is still missing. */
    | 'review-due'
  /** Drives colour only: info reads calm, action asks for a decision, urgent is time-boxed. */
  severity: 'info' | 'action' | 'urgent'
  /** Material Symbols glyph name. */
  icon: string
  title: string
  detail?: string
  href: string
  cta: string
}

export interface NotificationSummary {
  /** Distinct conversations holding unread messages — drives the nav badge. */
  threads: number
  /** `threads` split by request status, for the garage's two chat destinations. */
  appointmentThreads: number
  openThreads: number
  /** Garage only: pending requests it can still bid on — the Αιτήματα badge. */
  availableRequests: number
  /** Garage only: own offers waiting on a move (accepted-unopened, dates proposed). */
  offersNeedingAttention: number
  /** Everything currently waiting on this user, newest concern first. */
  alerts: Alert[]
}

export const EMPTY_SUMMARY: NotificationSummary = {
  threads: 0,
  appointmentThreads: 0,
  openThreads: 0,
  availableRequests: 0,
  offersNeedingAttention: 0,
  alerts: [],
}
