import {
  DEFAULT_VAT_RATE,
  splitVat,
  type CompletionAmounts,
  type CompletionOutcome,
} from '@/types/reviews'

/**
 * The VAT rates a garage may declare a job under — the ones the completion
 * form offers. The rate decides how much of a gross figure is net, and so
 * how much commission is charged, which is why the server accepts nothing
 * else: a garage sending 100% would otherwise halve its own commission base.
 */
export const DECLARABLE_VAT_RATES: readonly number[] = [DEFAULT_VAT_RATE]

/**
 * Whether a closed job is billed commission at all.
 *
 * Every outcome is stored as COMPLETED, so the status alone cannot tell a
 * finished job from a client who never turned up or work that was never done
 * — and neither of those earned the garage anything to take a share of.
 * Rows closed before outcomes were recorded carry none and stay billable.
 */
export function isCommissionable(request: { completionOutcome?: CompletionOutcome }): boolean {
  const outcome = request.completionOutcome
  return outcome === undefined || outcome === 'completed'
}

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
 * anything an admin closes without a declared amount. A quote is what the
 * client was told they would pay, VAT included, so the fallback is the net
 * part of it too — otherwise an undeclared job would cost the garage more
 * commission than a declared one for the same price.
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
    amount: typeof quoted === 'number' && quoted > 0 ? splitVat(quoted, 'gross', DEFAULT_VAT_RATE).net : 0,
    source: 'quoted',
  }
}

/** Rounds to the cent — every money figure on the commission pages goes through this. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

export interface CommissionLine {
  /** The net figure commission is taken from, to the cent. */
  basisAmount: number
  /** This job's commission, rounded to the cent as it would be invoiced. */
  commission: number
  source: 'declared' | 'quoted'
}

/**
 * One closed job's line on the commission report, or null when it bills
 * nothing (a no-show, work not done, or no usable amount at all).
 *
 * The overview and a garage's detail page both build their totals by summing
 * these lines. They used to differ — one rounded the sum, the other summed the
 * rounded rows, and only one of them dropped zero-amount jobs — so the figure
 * on the overview did not match the rows it opened onto.
 */
export function commissionLine(
  request: Parameters<typeof commissionBasis>[0] & { completionOutcome?: CompletionOutcome },
  commissionPercent: number
): CommissionLine | null {
  if (!isCommissionable(request)) return null
  const basis = commissionBasis(request)
  if (basis.amount <= 0) return null
  const basisAmount = roundCents(basis.amount)
  return {
    basisAmount,
    commission: roundCents(basisAmount * (commissionPercent / 100)),
    source: basis.source,
  }
}

/** Sums money figures that are already in cents-precision euros, without float drift. */
export function sumCents(values: number[]): number {
  return values.reduce((cents, v) => cents + Math.round(v * 100), 0) / 100
}
