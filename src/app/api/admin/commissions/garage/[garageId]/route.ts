import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'
import { ServiceRequestStatus } from '@/types/statuses'
import { DEPOSIT_PERCENT } from '@/lib/stripe-server'
import { commissionLine, roundCents, sumCents, type CommissionLine } from '@/lib/commission-basis'
import { athensToday } from '@/utils/athensTime'
import type { CompletionAmounts } from '@/types/reviews'

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
}

interface GarageCommissionsResponse {
  month: string
  garageId: string
  garageName: string
  commissionPercent: number
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
    const monthPrefix = `${month}-`

    // Fetch garage profile
    const garageRes = await dynamoDB.send(new GetCommand({
      TableName: 'Garages',
      Key: { id: garageId },
    }))
    const garage = garageRes.Item
    const garageName = garage?.companyName || garage?.email || garageId

    // Pull all completed requests for the month
    const completedItems: Record<string, unknown>[] = []
    let lastKey: Record<string, unknown> | undefined

    do {
      const result = await dynamoDB.send(new QueryCommand({
        TableName: 'ServiceRequests',
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        FilterExpression:
          'begins_with(appointmentDate, :monthPrefix) AND ' +
          '(attribute_exists(appointmentPrice) OR attribute_exists(finalAmounts))',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': ServiceRequestStatus.COMPLETED,
          ':monthPrefix': monthPrefix,
        },
        ExclusiveStartKey: lastKey,
      }))
      if (result.Items) completedItems.push(...result.Items)
      lastKey = result.LastEvaluatedKey
    } while (lastKey)

    // Filter to those whose accepted offer belongs to this garage
    const offerIds = Array.from(new Set(
      completedItems.map((r) => r.acceptedOfferId).filter((v): v is string => typeof v === 'string')
    ))

    const offerToGarage: Record<string, string> = {}
    for (let i = 0; i < offerIds.length; i += 100) {
      const batch = offerIds.slice(i, i + 100)
      const offersRes = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          Offers: {
            Keys: batch.map((id) => ({ id })),
            ProjectionExpression: 'id, garageId',
          },
        },
      }))
      for (const offer of offersRes.Responses?.Offers || []) {
        if (offer.garageId) offerToGarage[offer.id] = offer.garageId
      }
    }

    // The same per-job lines the overview sums (src/lib/commission-basis.ts):
    // no-shows, work not done and jobs with no usable amount bill nothing and
    // are left out of both.
    const garageRequests: { r: Record<string, unknown>; line: CommissionLine }[] = []
    for (const r of completedItems) {
      const offerId = typeof r.acceptedOfferId === 'string' ? r.acceptedOfferId : null
      if (!offerId || offerToGarage[offerId] !== garageId) continue
      const line = commissionLine(r as Parameters<typeof commissionLine>[0], DEPOSIT_PERCENT)
      if (line) garageRequests.push({ r, line })
    }

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
            ProjectionExpression: 'id, firstName, lastName, email',
          },
        },
      }))
      for (const c of res.Responses?.Clients || []) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
        clientNames[c.id] = name || c.email || c.id
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

    const appointments: AppointmentRow[] = garageRequests.map(({ r, line }) => {
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
      commissionPercent: DEPOSIT_PERCENT,
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
