import type { LedgerJobState } from '@/types/settlements'

/** One booked job on the client's Πληρωμές page. */
export interface ClientJob {
  requestId: string
  state: LedgerJobState
  category?: string
  appointmentDate?: string
  appointmentTime?: string | null
  vehicle?: string
  garage: { companyName?: string; municipality?: string } | null
  /** The garage's quote, net of VAT. */
  quoted: number | null
  /** What the garage declared it charged: net, VAT and the total the client paid. */
  declared: { net: number; vat: number; gross: number } | null
  /** Why it did not happen, as the garage put it. */
  reason: string | null
  /** The client's word on the garage's declaration; null until they give it. */
  confirmation: { status: 'confirmed' | 'disputed'; amountPaid?: number; note?: string } | null
  /** Whether the client can still confirm or dispute it. */
  canConfirm: boolean
}
