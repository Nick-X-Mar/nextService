/**
 * The garage's Πληρωμές tab: its jobs with the commission each one bills, and
 * what it has paid NextService towards that commission.
 *
 * A payment is declared by the garage and counts against what it owes at once.
 * An admin then matches it to the bank on /admin/commissions/[garageId]:
 * `confirmed`, or `rejected` when no such payment arrived — a rejected one
 * stops counting and the balance goes back up.
 */
export type SettlementStatus = 'declared' | 'confirmed' | 'rejected'

export const SETTLEMENT_METHODS = [
  { code: 'bank_transfer', label: 'Τραπεζική μεταφορά' },
  { code: 'card', label: 'Κάρτα' },
  { code: 'cash', label: 'Μετρητά' },
  { code: 'other', label: 'Άλλο' },
] as const

export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number]['code']

export function settlementMethodLabel(code: string): string {
  return SETTLEMENT_METHODS.find((m) => m.code === code)?.label ?? code
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  declared: 'Σε έλεγχο',
  confirmed: 'Επιβεβαιώθηκε',
  rejected: 'Δεν βρέθηκε',
}

export interface Settlement {
  settlementId: string
  garageId: string
  amount: number
  /** The day the garage says it paid, YYYY-MM-DD. */
  paidOn: string
  method: SettlementMethod
  reference?: string
  status: SettlementStatus
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
}

/**
 * Where a booked job stands, for the Πληρωμές filters:
 * - `upcoming` — the appointment has not started;
 * - `awaiting` — it has, and the garage has not said how it went (billed on the quote meanwhile);
 * - `completed` — done and declared;
 * - `not_done` — declared as not having happened;
 * - `cancelled` — the booking was cancelled before the day.
 */
export type LedgerJobState = 'upcoming' | 'awaiting' | 'completed' | 'not_done' | 'cancelled'

export interface LedgerJob {
  requestId: string
  state: LedgerJobState
  category?: string
  appointmentDate?: string
  appointmentTime?: string | null
  vehicle?: string
  clientFirstName?: string
  /** The quote, net of VAT. */
  quoted: number | null
  /** What the garage declared it charged, when it has. */
  declared: { net: number; vat: number; gross: number } | null
  /** Why it did not happen, or why it cost less than quoted. */
  reason: string | null
  /** For a `not_done` job: where the admin's check with the client stands. */
  outcomeReview: 'pending' | 'confirmed' | 'rejected' | null
  /** The commission this job bills (0 when it bills nothing), and at what rate. */
  commission: number
  commissionPercent: number
  /** The net the commission was taken from: the declared one, or the quote until there is one. */
  commissionBasis: number
  /** Did the client confirm what the garage declared? */
  clientConfirmation: 'confirmed' | 'disputed' | null
}

export interface LedgerTotals {
  /** Commission billed by every job so far. */
  commission: number
  /** Declared or confirmed payments — what the balance is reduced by. */
  paid: number
  /** Of `paid`, still waiting on an admin's check. */
  paidUnconfirmed: number
  /** What the garage still owes NextService (negative: paid in advance). */
  balance: number
}

export interface GarageLedger {
  jobs: LedgerJob[]
  settlements: Settlement[]
  totals: LedgerTotals
  defaultCommissionPercent: number
}
