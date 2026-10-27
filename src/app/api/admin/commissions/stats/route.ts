import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'
import { ServiceRequestStatus } from '@/types/statuses'
import { DEPOSIT_PERCENT } from '@/lib/stripe-server'
import { commissionLine, sumCents } from '@/lib/commission-basis'
import { athensToday } from '@/utils/athensTime'

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
}

interface CommissionsStatsResponse {
  month: string
  commissionPercent: number
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
    const monthPrefix = `${month}-`

    // Query all completed requests via StatusIndex, paginated
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

    // Resolve garageId per request via the accepted offer
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

    // Aggregate per garage, from the same per-job lines the garage's detail
    // page lists (src/lib/commission-basis.ts), so the two always agree.
    //
    // Revenue is what the garage declared it actually charged, net of VAT —
    // not the price it quoted. `declaredCount` is surfaced so the admin can see
    // how much of a month's figure rests on real declarations rather than on
    // the fallback.
    const aggregateByGarage = new Map<
      string,
      { revenues: number[]; commissions: number[]; declaredCount: number }
    >()

    for (const r of completedItems) {
      const offerId = typeof r.acceptedOfferId === 'string' ? r.acceptedOfferId : null
      if (!offerId) continue
      const garageId = offerToGarage[offerId]
      if (!garageId) continue
      const line = commissionLine(r as Parameters<typeof commissionLine>[0], DEPOSIT_PERCENT)
      if (!line) continue

      const entry = aggregateByGarage.get(garageId) ?? { revenues: [], commissions: [], declaredCount: 0 }
      entry.revenues.push(line.basisAmount)
      entry.commissions.push(line.commission)
      if (line.source === 'declared') entry.declaredCount += 1
      aggregateByGarage.set(garageId, entry)
    }

    // Resolve garage names
    const garageIds = Array.from(aggregateByGarage.keys())
    const garageNames: Record<string, string> = {}

    for (let i = 0; i < garageIds.length; i += 100) {
      const batch = garageIds.slice(i, i + 100)
      const garagesRes = await dynamoDB.send(new BatchGetCommand({
        RequestItems: {
          Garages: {
            Keys: batch.map((id) => ({ id })),
            ProjectionExpression: 'id, companyName, email',
          },
        },
      }))
      for (const g of garagesRes.Responses?.Garages || []) {
        garageNames[g.id] = g.companyName || g.email || g.id
      }
    }

    const byGarage: GarageBreakdown[] = garageIds.map((garageId) => {
      const agg = aggregateByGarage.get(garageId)!
      return {
        garageId,
        garageName: garageNames[garageId] || garageId,
        appointmentCount: agg.revenues.length,
        totalRevenue: sumCents(agg.revenues),
        commission: sumCents(agg.commissions),
        declaredCount: agg.declaredCount,
      }
    })

    byGarage.sort((a, b) => b.commission - a.commission)

    const response: CommissionsStatsResponse = {
      month,
      commissionPercent: DEPOSIT_PERCENT,
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
