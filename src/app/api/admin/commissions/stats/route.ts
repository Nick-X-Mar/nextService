import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { withMetrics } from '@/utils/withMetrics'
import { ServiceRequestStatus } from '@/types/statuses'
import { DEPOSIT_PERCENT } from '@/lib/stripe-server'

interface GarageBreakdown {
  garageId: string
  garageName: string
  appointmentCount: number
  totalRevenue: number
  commission: number
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

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
        FilterExpression: 'begins_with(appointmentDate, :monthPrefix) AND attribute_exists(appointmentPrice)',
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

    // Aggregate per garage
    const aggregateByGarage = new Map<string, { appointmentCount: number; totalRevenue: number }>()

    for (const r of completedItems) {
      const offerId = typeof r.acceptedOfferId === 'string' ? r.acceptedOfferId : null
      if (!offerId) continue
      const garageId = offerToGarage[offerId]
      if (!garageId) continue
      const price = typeof r.appointmentPrice === 'number' ? r.appointmentPrice : 0
      if (price <= 0) continue

      const entry = aggregateByGarage.get(garageId) ?? { appointmentCount: 0, totalRevenue: 0 }
      entry.appointmentCount += 1
      entry.totalRevenue += price
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

    const factor = DEPOSIT_PERCENT / 100

    const byGarage: GarageBreakdown[] = garageIds.map((garageId) => {
      const agg = aggregateByGarage.get(garageId)!
      const totalRevenue = Math.round(agg.totalRevenue * 100) / 100
      const commission = Math.round(agg.totalRevenue * factor * 100) / 100
      return {
        garageId,
        garageName: garageNames[garageId] || garageId,
        appointmentCount: agg.appointmentCount,
        totalRevenue,
        commission,
      }
    })

    byGarage.sort((a, b) => b.commission - a.commission)

    const totals = byGarage.reduce(
      (acc, g) => {
        acc.appointmentCount += g.appointmentCount
        acc.totalRevenue += g.totalRevenue
        acc.commission += g.commission
        return acc
      },
      { appointmentCount: 0, totalRevenue: 0, commission: 0 }
    )

    const response: CommissionsStatsResponse = {
      month,
      commissionPercent: DEPOSIT_PERCENT,
      totals: {
        appointmentCount: totals.appointmentCount,
        totalRevenue: Math.round(totals.totalRevenue * 100) / 100,
        commission: Math.round(totals.commission * 100) / 100,
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
