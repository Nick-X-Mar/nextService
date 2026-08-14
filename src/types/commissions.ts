/**
 * Commission model.
 *
 * The platform's cut on a completed appointment is resolved through a
 * three-level cascade, most specific first:
 *
 *   1. a per-job override  (CommissionOverride, keyed by requestId)
 *   2. the garage's own agreed rate  (Garages.commissionPercent)
 *   3. the global default  (DEPOSIT_PERCENT, 15%)
 *
 * Only levels 1 and 2 are persisted; level 3 comes from env. A job override
 * always carries a reason so the number is auditable months later.
 */

/** `percent` = share of the job price, `fixed` = a flat amount in EUR. */
export type CommissionOverrideType = 'percent' | 'fixed'

export interface CommissionOverride {
  /** PK — the ServiceRequests id this override applies to. */
  requestId: string
  garageId: string
  /** YYYY-MM, derived from the request's appointmentDate. */
  month: string
  type: CommissionOverrideType
  /** 0–100 when `type` is 'percent', EUR when 'fixed'. */
  value: number
  reason: string
  /** Email of the admin who set it. */
  setBy: string
  setAt: string
}

/** Which level of the cascade produced the number. */
export type CommissionSource = 'job' | 'garage' | 'default'

export interface ResolvedCommission {
  /** What the platform takes, in EUR. */
  amount: number
  /** The same figure expressed as a share of the job price. */
  percent: number
  source: CommissionSource
  overrideType?: CommissionOverrideType
  overrideValue?: number
  reason?: string
  setBy?: string
  setAt?: string
}

export type SettlementStatus = 'pending' | 'paid'

export interface CommissionSettlement {
  /** PK — `${garageId}#${month}`, so writes are idempotent upserts. */
  settlementId: string
  garageId: string
  /** YYYY-MM */
  month: string
  status: SettlementStatus
  /** Amount actually collected, if it differed from the computed total. */
  amount?: number
  note?: string
  paidAt?: string
  updatedBy: string
  updatedAt: string
}

/** One completed job, with its resolved commission. */
export interface CommissionAppointmentRow {
  requestId: string
  appointmentDate: string
  clientName: string
  vehicleLabel: string
  category: string
  appointmentPrice: number
  commission: number
  commissionPercent: number
  source: CommissionSource
  overrideType?: CommissionOverrideType
  overrideValue?: number
  reason?: string
  setBy?: string
  setAt?: string
}

export interface CommissionGarageBreakdown {
  garageId: string
  garageName: string
  appointmentCount: number
  totalRevenue: number
  commission: number
  /** Blended rate actually applied across the month's jobs. */
  effectivePercent: number
  /** The rate this garage would get with no per-job overrides. */
  defaultPercent: number
  /** True when the garage has its own agreed rate. */
  hasCustomRate: boolean
  overrideCount: number
  settlementStatus: SettlementStatus
  paidAt?: string
  settledAmount?: number
  settlementNote?: string
}

export interface CommissionTrendPoint {
  month: string
  appointmentCount: number
  totalRevenue: number
  commission: number
  /** Commission on garage-months already marked as collected. */
  paid: number
  /** The rest — what is still owed. */
  due: number
}
