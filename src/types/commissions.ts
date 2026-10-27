/**
 * Commission model. The logic lives in src/lib/commission-basis.ts; this is
 * the summary.
 *
 * - **Basis:** the net (ex-VAT) amount the garage declared it charged when it
 *   completed the job; the quote's net for older jobs with no declaration.
 *   No-shows and work not done bill nothing.
 * - **Rate:** frozen on the job at completion (`ServiceRequests.commissionPercent`)
 *   from the garage's agreed rate (`Garages.commissionPercent`, set by an admin
 *   on /admin/commissions/[garageId]) or DEFAULT_COMMISSION_PERCENT (15%).
 *   Jobs completed before rates were frozen use the garage's current rate.
 * - **Month:** the YYYY-MM of the job's `appointmentDate` (an Athens date).
 * - **Rounding:** each job's commission is rounded to the cent, and totals are
 *   the sum of those rounded lines — what an invoice would list.
 */
export type { CommissionRateSource } from '@/lib/commission-basis'
