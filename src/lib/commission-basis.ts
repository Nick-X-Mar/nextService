import type { CompletionAmounts } from '@/types/reviews'

/**
 * The figure commission is charged on, for one completed job.
 *
 * Before the completion flow existed there was only `appointmentPrice` — the
 * price the garage *quoted*. Commission was calculated on that, which is wrong
 * in both directions: the job may have grown once the car was on the ramp, or
 * shrunk when part of the work turned out not to be needed.
 *
 * Now a garage declares what it actually charged, and this returns the **net**
 * figure, excluding VAT. VAT is money collected on the state's behalf and
 * passed straight on; charging commission on it would bill the garage for
 * handling someone else's tax.
 *
 * The quote remains the fallback for jobs closed before this shipped, and for
 * anything an admin closes without a declared amount.
 */
export function commissionBasis(request: {
  finalAmounts?: CompletionAmounts
  appointmentPrice?: number
}): { amount: number; source: 'declared' | 'quoted' } {
  const declared = request.finalAmounts?.net
  if (typeof declared === 'number' && declared > 0) {
    return { amount: declared, source: 'declared' }
  }
  const quoted = request.appointmentPrice
  return {
    amount: typeof quoted === 'number' && quoted > 0 ? quoted : 0,
    source: 'quoted',
  }
}
