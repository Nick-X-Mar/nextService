import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import {
  DEFAULT_COMMISSION_PERCENT,
  garageCommissionPercent,
  parseCommissionPercent,
  sumCents,
} from '@/lib/commission-basis'
import { athensToday } from '@/utils/athensTime'
import { billedJobsForMonth } from '../billedJobs'

interface GarageBreakdown {
  garageId: string
  garageName: string
  appointmentCount: number
  totalRevenue: number
  commission: number
  /**
   * How many of `appointmentCount` carry an amount the garage actually
   * declared. The rest fall back to the quoted price, so a month where this is
   * well below the count is reporting estimates, not settled figures.
   */
  declaredCount: number
  /** The garage's rate today — what a job it completes now is billed at. */
  commissionPercent: number
  /** True when that rate is an agreed one, not the default. */
  hasCustomRate: boolean
  /**
   * Commission over revenue for this month's jobs. Differs from
   * `commissionPercent` when the rate changed during the month: each job keeps
   * the rate it was completed at.
   */
  effectivePercent: number
}

interface CommissionsStatsResponse {
  month: string
  defaultCommissionPercent: number
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
    activeGaragesCount: number
  }
  byGarage: GarageBreakdown[]
}

function isValidMonth(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** The Athens month — the server runs in UTC, which is still last month for the first hours of the 1st. */
function currentMonth(): string {
  return athensToday().slice(0, 7)
}

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month')
    const month = isValidMonth(monthParam) ? monthParam : currentMonth()

    const { jobs, garages } = await billedJobsForMonth(month)

    // Summed from the same per-job lines a garage's detail page lists, so the
    // two always agree. Revenue is the net the commission was taken from.
    const byGarageId = new Map<string, { revenues: number[]; commissions: number[]; declaredCount: number }>()
    for (const job of jobs) {
      const entry = byGarageId.get(job.garageId) ?? { revenues: [], commissions: [], declaredCount: 0 }
      entry.revenues.push(job.line.basisAmount)
      entry.commissions.push(job.line.commission)
      if (job.line.source === 'declared') entry.declaredCount += 1
      byGarageId.set(job.garageId, entry)
    }

    const byGarage: GarageBreakdown[] = Array.from(byGarageId, ([garageId, agg]) => {
      const garage = garages.get(garageId)
      const totalRevenue = sumCents(agg.revenues)
      const commission = sumCents(agg.commissions)
      return {
        garageId,
        garageName: (garage?.companyName as string) || (garage?.email as string) || garageId,
        appointmentCount: agg.revenues.length,
        totalRevenue,
        commission,
        declaredCount: agg.declaredCount,
        commissionPercent: garageCommissionPercent(garage),
        hasCustomRate: parseCommissionPercent(garage?.commissionPercent) !== null,
        effectivePercent: totalRevenue > 0 ? Math.round((commission / totalRevenue) * 10000) / 100 : 0,
      }
    })
    byGarage.sort((a, b) => b.commission - a.commission)

    const response: CommissionsStatsResponse = {
      month,
      defaultCommissionPercent: DEFAULT_COMMISSION_PERCENT,
      totals: {
        appointmentCount: byGarage.reduce((n, g) => n + g.appointmentCount, 0),
        totalRevenue: sumCents(byGarage.map((g) => g.totalRevenue)),
        commission: sumCents(byGarage.map((g) => g.commission)),
        activeGaragesCount: byGarage.length,
      },
      byGarage,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Commissions stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch commissions stats' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
