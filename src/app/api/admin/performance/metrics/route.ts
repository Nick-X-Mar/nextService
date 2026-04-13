import { NextRequest, NextResponse } from 'next/server'
import {
  queryMetrics,
  aggregateByEndpoint,
  bucketByTime,
  latencyHistogram,
  percentile,
} from '@/utils/performanceService'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || '24h'

    const now = new Date()
    let since: Date
    let bucketMinutes: number

    switch (range) {
      case '1h':
        since = new Date(now.getTime() - 60 * 60 * 1000)
        bucketMinutes = 5
        break
      case '6h':
        since = new Date(now.getTime() - 6 * 60 * 60 * 1000)
        bucketMinutes = 15
        break
      case '24h':
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        bucketMinutes = 60
        break
      case '7d':
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        bucketMinutes = 360
        break
      default:
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        bucketMinutes = 60
    }

    const metrics = await queryMetrics({ since: since.toISOString() })

    const endpointStats = aggregateByEndpoint(metrics)
    const volumeOverTime = bucketByTime(metrics, bucketMinutes)
    const histogram = latencyHistogram(metrics)

    // Top 10 slowest endpoints by p95
    const top10Slow = [...endpointStats]
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 10)

    // Error rate over time
    const errorOverTime = volumeOverTime.map((b) => ({
      time: b.time,
      errorRate: b.count > 0 ? b.errorCount / b.count : 0,
      errorCount: b.errorCount,
      totalCount: b.count,
    }))

    // Global stats
    const allTimes = metrics.map((m) => m.responseTimeMs)
    const totalErrors = metrics.filter((m) => m.statusCode >= 400).length

    return NextResponse.json({
      summary: {
        totalRequests: metrics.length,
        totalErrors,
        errorRate: metrics.length > 0 ? totalErrors / metrics.length : 0,
        p50: percentile(allTimes, 50),
        p95: percentile(allTimes, 95),
        p99: percentile(allTimes, 99),
        avg: allTimes.length > 0 ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length) : 0,
      },
      endpointStats,
      top10Slow,
      volumeOverTime,
      errorOverTime,
      histogram,
      range,
    })
  } catch (error) {
    console.error('Performance metrics error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
