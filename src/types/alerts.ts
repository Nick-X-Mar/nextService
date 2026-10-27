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
  /**
   * Garage only: the requests behind `availableRequests`. The live channel
   * moves the badge between polls, and it can only take a request off the
   * count if it knows the request was on it — a broadcast about a job this
   * garage already bid on, or one being completed, must not touch it.
   */
  availableRequestIds: string[]
  /**
   * Garage only: when the market snapshot behind `availableRequestIds` was
   * read. The snapshot is shared and cached, so a request created after this
   * may be missing from it — the browser keeps those from the realtime channel.
   */
  marketAsOf?: string
  /**
   * Garage only: requests this garage bid on since shortly before
   * `marketAsOf`. A request that arrived over realtime after the snapshot is
   * not in it to be filtered out, so this is how the browser learns to drop it.
   */
  recentlyAnsweredIds?: string[]
  /** Garage only: own offers waiting on a move (accepted-unopened, dates proposed). */
  offersNeedingAttention: number
  /** Everything currently waiting on this user, newest concern first. */
  alerts: Alert[]
}

/**
 * Slack between the server clock that stamped a request's `createdAt` and the
 * one that read the market snapshot, plus the index's replication lag: a request
 * created this close to `marketAsOf` may or may not be in the snapshot, so it is
 * treated as possibly missing.
 */
export const MARKET_SNAPSHOT_MARGIN_MS = 5_000

export const EMPTY_SUMMARY: NotificationSummary = {
  threads: 0,
  appointmentThreads: 0,
  openThreads: 0,
  availableRequests: 0,
  availableRequestIds: [],
  offersNeedingAttention: 0,
  alerts: [],
}
