import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import { getErrorGroups, type LogLevelFilter, type StatusFilter } from '@/utils/errorGroups'
import { STAGE } from '@/lib/site-url'

const VALID_STATUSES: StatusFilter[] = ['open', 'all', 'resolved', 'ignored']
const VALID_LEVELS: LogLevelFilter[] = ['all', 'error', 'warn']

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '24h'
    const rawStatus = (searchParams.get('status') || 'open') as StatusFilter
    const statusFilter: StatusFilter = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'open'
    const rawLevel = (searchParams.get('level') || 'all') as LogLevelFilter
    const levelFilter: LogLevelFilter = VALID_LEVELS.includes(rawLevel) ? rawLevel : 'all'

    return NextResponse.json(await getErrorGroups({ range, statusFilter, levelFilter }))
  } catch (error) {
    console.error('Error monitoring error:', error)
    // Return empty state instead of error — CloudWatch might not be configured locally
    return NextResponse.json({
      groups: [],
      stage: STAGE,
      totalErrors: 0,
      totalWarnings: 0,
      totalEntries: 0,
      totalGroups: 0
    })
  }
}

export const GET = withMetrics(_GET)
