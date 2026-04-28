import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import { getErrorGroups, type StatusFilter } from '@/utils/errorGroups'

const VALID_STATUSES: StatusFilter[] = ['open', 'all', 'resolved', 'ignored']

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '24h'
    const rawStatus = (searchParams.get('status') || 'open') as StatusFilter
    const statusFilter: StatusFilter = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'open'

    const result = await getErrorGroups({ range, statusFilter })

    return NextResponse.json({
      groups: result.groups,
      total5xx: result.total5xx,
      total4xx: result.total4xx,
      totalEntries: result.totalEntries,
      totalGroups: result.totalGroups
    })
  } catch (error) {
    console.error('Error monitoring error:', error)
    // Return empty state instead of error — CloudWatch might not be configured locally
    return NextResponse.json({
      groups: [],
      total5xx: 0,
      total4xx: 0,
      totalEntries: 0,
      totalGroups: 0
    })
  }
}

export const GET = withMetrics(_GET)
