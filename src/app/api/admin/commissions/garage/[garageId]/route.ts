import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'
import {
  DEFAULT_COMMISSION_PERCENT,
  garageCommissionPercent,
  parseCommissionPercent,
  roundCents,
  sumCents,
  type CommissionRateSource,
} from '@/lib/commission-basis'
import { athensToday } from '@/utils/athensTime'
import type { CompletionAmounts } from '@/types/reviews'
import { billedJobsForMonth } from '../../billedJobs'

interface AppointmentRow {
  requestId: string
  appointmentDate: string
  clientName: string
  vehicleLabel: string
  category: string
  /** What the garage quoted when the client booked, VAT included. */
  appointmentPrice: number
  /** What it declared it actually charged, net of VAT. Null when never declared. */
  declaredNet: number | null
  /** Gross and VAT alongside, so the admin can reconcile against a receipt. */
  declaredGross: number | null
  declaredVat: number | null
  /** Which of the two the commission below was calculated on. */
  basis: 'declared' | 'quoted'
  /** The net figure the commission was taken from — the declared net, or the quote's net. */
  basisAmount: number
  commission: number
  /** The rate this job was billed at: frozen at completion, else the garage's rate, else the default. */
  commissionPercent: number
  rateSource: CommissionRateSource
}

interface GarageCommissionsResponse {
  month: string
  garageId: string
  garageName: string
  /** The garage's rate today — what a job it completes now is frozen at. */
  commissionPercent: number
  hasCustomRate: boolean
  defaultCommissionPercent: number
  rateSetAt?: string
  rateSetBy?: string
  totals: {
    appointmentCount: number
    totalRevenue: number
    commission: number
  }
  appointments: AppointmentRow[]
}

function isValidMonth(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** The Athens month — the server runs in UTC, which is still last month for the first hours of the 1st. */
function currentMonth(): string {
  return athensToday().slice(0, 7)
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params
    if (!garageId) {
      return NextResponse.json({ error: 'garageId is required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month')
    const month = isValidMonth(monthParam) ? monthParam : currentMonth()

    const { jobs, garages } = await billedJobsForMonth(month, garageId)
    const garage = garages.get(garageId)
    const garageName = (garage?.companyName as string) || (garage?.email as string) || garageId
    const garageRequests = jobs.map((job) => ({ r: job.request, line: job.line, percent: job.percent, rateSource: job.rateSource }))

    // Resolve client names + vehicle info
    const clientIds = Array.from(new Set(
      garageRequests.map(({ r }) => r.clientId).filter((v): v is string => typeof v === 'string')
    ))
    const vehicleIds = Array.from(new Set(
      garageRequests.map(({ r }) => r.vehicleId).filter((v): v is string => typeof v === 'string')
    ))

    const clientNames: Record<string, string> = {}
    for (let i = 0; i < clientIds.length; i += 100) {
      const batch = clientIds.slice(i, i + 100)
      const res = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          Clients: {
            Keys: batch.map((id) => ({ id })),
            ProjectionExpression: 'id, firstName, lastName, email, anonymizedAt',
          },
        },
      }))
      for (const c of res.Responses?.Clients || []) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
        // A closed account keeps its jobs, not its name.
        clientNames[c.id] = c.anonymizedAt ? 'Διαγραμμένος πελάτης' : (name || c.email || c.id)
      }
    }

    const vehicleLabels: Record<string, string> = {}
    for (let i = 0; i < vehicleIds.length; i += 100) {
      const batch = vehicleIds.slice(i, i + 100)
      const res = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          Vehicles: {
            Keys: batch.map((id) => ({ id })),
            ProjectionExpression: 'id, brand, #m, modelYear, licensePlate',
            ExpressionAttributeNames: { '#m': 'model' },
          },
        },
      }))
      for (const v of res.Responses?.Vehicles || []) {
        const parts = [v.brand, v.model, v.modelYear].filter(Boolean).join(' ')
        const plate = v.licensePlate ? ` (${v.licensePlate})` : ''
        vehicleLabels[v.id] = (parts + plate).trim() || '-'
      }
    }

    const appointments: AppointmentRow[] = garageRequests.map(({ r, line, percent, rateSource }) => {
      const quoted = typeof r.appointmentPrice === 'number' ? r.appointmentPrice : 0
      const declared = (r as { finalAmounts?: CompletionAmounts }).finalAmounts
      const clientId = typeof r.clientId === 'string' ? r.clientId : ''
      const vehicleId = typeof r.vehicleId === 'string' ? r.vehicleId : ''
      return {
        requestId: typeof r.id === 'string' ? r.id : '',
        appointmentDate: typeof r.appointmentDate === 'string' ? r.appointmentDate : '',
        clientName: clientNames[clientId] || '-',
        vehicleLabel: vehicleLabels[vehicleId] || '-',
        category: typeof r.serviceCategory === 'string'
          ? r.serviceCategory
          : (typeof r.category === 'string' ? r.category : '-'),
        appointmentPrice: roundCents(quoted),
        declaredNet: declared?.net ?? null,
        declaredGross: declared?.gross ?? null,
        declaredVat: declared?.vat ?? null,
        basis: line.source,
        basisAmount: line.basisAmount,
        commission: line.commission,
        commissionPercent: percent,
        rateSource,
      }
    })

    appointments.sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))

    // Summed from the rows exactly as listed, the same way the overview sums
    // them, so the totals here equal that garage's line there.
    const totalRevenue = sumCents(appointments.map((a) => a.basisAmount))
    const totalCommission = sumCents(appointments.map((a) => a.commission))

    const response: GarageCommissionsResponse = {
      month,
      garageId,
      garageName,
      commissionPercent: garageCommissionPercent(garage),
      hasCustomRate: parseCommissionPercent(garage?.commissionPercent) !== null,
      defaultCommissionPercent: DEFAULT_COMMISSION_PERCENT,
      ...(typeof garage?.commissionPercentSetAt === 'string' ? { rateSetAt: garage.commissionPercentSetAt } : {}),
      ...(typeof garage?.commissionPercentSetBy === 'string' ? { rateSetBy: garage.commissionPercentSetBy } : {}),
      totals: {
        appointmentCount: appointments.length,
        totalRevenue,
        commission: totalCommission,
      },
      appointments,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Garage commissions detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch garage commissions' }, { status: 500 })
  }
}

export const GET = withMetrics(_GET)
