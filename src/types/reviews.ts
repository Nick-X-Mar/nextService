/**
 * Post-appointment completion and two-way reviews.
 *
 * The flow: a few hours after an appointment's slot has passed, the garage is
 * asked to confirm the job happened, declare what it actually charged, and
 * rate the client. Once it does, the client is asked to rate the garage.
 */

/** Greek standard VAT rate, as a percentage. */
export const DEFAULT_VAT_RATE = 24

/**
 * How long after the appointment's end we start asking. Not immediately: a car
 * is usually still on the ramp, and a prompt that arrives mid-job trains people
 * to ignore it.
 */
export const COMPLETION_GRACE_HOURS = 4

/**
 * When an appointment has no recorded time, assume a full working day so the
 * prompt never lands while the job could still be running.
 */
export const ASSUMED_APPOINTMENT_END = '18:00'

/**
 * How long a review stays hidden from the other side when only one of them has
 * written. Neither party sees the other's rating until both have submitted or
 * this window passes, so nobody can write a retaliatory review.
 */
export const REVIEW_REVEAL_DAYS = 14

/** How long the client has to review after the job is marked complete. */
export const REVIEW_WINDOW_DAYS = 30

export type CompletionOutcome =
  /** The work was carried out. */
  | 'completed'
  /** The client never turned up. */
  | 'no_show'
  /** The client came but the job did not happen — wrong diagnosis, declined quote. */
  | 'not_done'

export type ReviewDirection = 'client_to_garage' | 'garage_to_client'

export type ReviewStatus = 'published' | 'hidden'

/** What a garage declares it actually charged. */
export interface CompletionAmounts {
  /** What the client paid in total, VAT included. */
  gross: number
  /** The same figure excluding VAT — what commission is calculated on. */
  net: number
  /** The VAT portion. */
  vat: number
  /** Percentage applied, kept per-record so a future rate change is not retroactive. */
  vatRate: number
  /** Whether the garage typed a gross or a net figure. Kept for the audit trail. */
  enteredAs: 'gross' | 'net'
}

export interface Review {
  reviewId: string
  requestId: string
  garageId: string
  clientId: string
  direction: ReviewDirection
  /** 1–5. */
  rating: number
  comment?: string
  /** Short pre-set reasons, e.g. 'Συνέπεια στην ώρα'. */
  tags?: string[]
  status: ReviewStatus
  /**
   * When the counterparty may see it. Set to now once both sides have written,
   * otherwise to createdAt + REVIEW_REVEAL_DAYS.
   */
  revealAt: string
  createdAt: string
  updatedAt?: string
  /** Admin who hid or restored it. */
  moderatedBy?: string
  moderatedAt?: string
  moderationReason?: string
}

/**
 * The rolling aggregate kept on a Garage or Client row.
 *
 * Count and sum only — the average is derived on read. Storing it as well
 * would mean a second write to compute it from the value the first write just
 * produced, and any interleaving there leaves a stored average that disagrees
 * with its own count and sum.
 */
export interface RatingAggregate {
  ratingCount: number
  ratingSum: number
}

/** The average, or null when nobody has rated yet. */
export function ratingAverage(aggregate: Partial<RatingAggregate> | undefined): number | null {
  const count = aggregate?.ratingCount ?? 0
  const sum = aggregate?.ratingSum ?? 0
  if (count <= 0) return null
  return Math.round((sum / count) * 10) / 10
}

/** Completion data written onto the ServiceRequests row. */
export interface CompletionRecord {
  completedAt: string
  completedBy: 'garage' | 'admin'
  outcome: CompletionOutcome
  amounts?: CompletionAmounts
  notes?: string
}

/** The tags offered to each side. Kept server-side so they stay a closed set. */
export const GARAGE_REVIEW_TAGS = [
  'Συνέπεια στην ώρα',
  'Καθαρή δουλειά',
  'Καλή τιμή',
  'Καλή επικοινωνία',
  'Εξήγησε τι έκανε',
  'Τήρησε την προσφορά',
] as const

export const CLIENT_REVIEW_TAGS = [
  'Ήρθε στην ώρα του',
  'Σαφής περιγραφή',
  'Καλή επικοινωνία',
  'Πλήρωσε κανονικά',
  'Ευγενικός',
] as const

export type GarageReviewTag = (typeof GARAGE_REVIEW_TAGS)[number]
export type ClientReviewTag = (typeof CLIENT_REVIEW_TAGS)[number]

/**
 * Splits a declared amount into net and VAT.
 *
 * Rounded to cents at every step: the garage types one figure and both the
 * other figure and the commission are derived from it, so an unrounded
 * intermediate would show up as a one-cent discrepancy on an invoice.
 */
export function splitVat(
  amount: number,
  enteredAs: 'gross' | 'net',
  vatRate: number = DEFAULT_VAT_RATE
): CompletionAmounts {
  const round = (n: number) => Math.round(n * 100) / 100
  const factor = 1 + vatRate / 100

  if (enteredAs === 'gross') {
    const net = round(amount / factor)
    return { gross: round(amount), net, vat: round(amount - net), vatRate, enteredAs }
  }
  const gross = round(amount * factor)
  return { gross, net: round(amount), vat: round(gross - amount), vatRate, enteredAs }
}

/**
 * The moment an appointment is considered over.
 *
 * Appointments are stored as a local date plus an optional 'HH:MM', with no
 * timezone — every date comparison in this app is local-midnight arithmetic.
 * A missing time means the appointment predates hourly slots, so it is treated
 * as running to the end of the working day.
 */
export function appointmentEndsAt(date: string, time?: string | null): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const clock = time && /^\d{2}:\d{2}$/.test(time) ? time : ASSUMED_APPOINTMENT_END
  const parsed = new Date(`${date}T${clock}:00`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/** Whether enough time has passed since the appointment to ask about it. */
export function isCompletionDue(
  date: string,
  time: string | null | undefined,
  now: Date = new Date()
): boolean {
  const end = appointmentEndsAt(date, time)
  if (!end) return false
  return now.getTime() >= end.getTime() + COMPLETION_GRACE_HOURS * 3600_000
}
