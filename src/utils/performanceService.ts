/**
 * Performance metrics service — writes API call metrics to DynamoDB
 * and provides query helpers for the admin dashboard.
 */
import { dynamoDB } from '@/utils/dynamoService'
import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ensurePerformanceTable, PERFORMANCE_TABLE } from '@/utils/ensurePerformanceTable'

export interface PerformanceMetric {
  endpoint: string
  method: string
  statusCode: number
  responseTimeMs: number
  timestamp: string
  userId?: string
}

/**
 * Record an API call metric. Fire-and-forget — errors are logged, not thrown.
 */
export async function recordMetric(metric: PerformanceMetric): Promise<void> {
  try {
    await ensurePerformanceTable()
    // Append a random suffix to timestamp to avoid sort-key collisions
    // when multiple requests to the same endpoint happen in the same ms
    const uniqueTimestamp = `${metric.timestamp}#${Math.random().toString(36).slice(2, 8)}`
    await dynamoDB.send(new PutCommand({
      TableName: PERFORMANCE_TABLE,
      Item: {
        endpoint: metric.endpoint,
        method: metric.method,
        statusCode: metric.statusCode,
        responseTimeMs: metric.responseTimeMs,
        timestamp: uniqueTimestamp,
        rawTimestamp: metric.timestamp,
        userId: metric.userId || 'anonymous',
      }
    }))
  } catch (err) {
    console.error('[performanceService] Failed to record metric:', err)
  }
}

export interface TimeWindow {
  since: string // ISO string
  until?: string // ISO string, defaults to now
}

/**
 * Fetch all metrics within a time window. Uses a full scan with filter
 * (acceptable for admin dashboard; volume is bounded by API traffic).
 */
export async function queryMetrics(window: TimeWindow): Promise<PerformanceMetric[]> {
  await ensurePerformanceTable()
  const until = window.until || new Date().toISOString()

  const items: PerformanceMetric[] = []
  let lastKey: Record<string, unknown> | undefined

  do {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: PERFORMANCE_TABLE,
      FilterExpression: 'rawTimestamp BETWEEN :since AND :until',
      ExpressionAttributeValues: {
        ':since': window.since,
        ':until': until,
      },
      ExclusiveStartKey: lastKey,
    }))

    for (const item of result.Items || []) {
      items.push({
        endpoint: item.endpoint as string,
        method: item.method as string,
        statusCode: item.statusCode as number,
        responseTimeMs: item.responseTimeMs as number,
        timestamp: item.rawTimestamp as string,
        userId: item.userId as string | undefined,
      })
    }
    lastKey = result.LastEvaluatedKey
  } while (lastKey)

  return items
}

/**
 * Fetch metrics for a specific endpoint within a time window.
 */
export async function queryEndpointMetrics(endpoint: string, window: TimeWindow): Promise<PerformanceMetric[]> {
  await ensurePerformanceTable()
  const until = window.until || new Date().toISOString()

  const items: PerformanceMetric[] = []
  let lastKey: Record<string, unknown> | undefined

  do {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: PERFORMANCE_TABLE,
      KeyConditionExpression: 'endpoint = :ep AND #ts BETWEEN :since AND :until',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':ep': endpoint,
        ':since': window.since,
        ':until': `${until}~`, // ~ sorts after any UUID suffix
      },
      ExclusiveStartKey: lastKey,
    }))

    for (const item of result.Items || []) {
      items.push({
        endpoint: item.endpoint as string,
        method: item.method as string,
        statusCode: item.statusCode as number,
        responseTimeMs: item.responseTimeMs as number,
        timestamp: item.rawTimestamp as string,
        userId: item.userId as string | undefined,
      })
    }
    lastKey = result.LastEvaluatedKey
  } while (lastKey)

  return items
}

// ─── Aggregation helpers ───────────────────────────────────────

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export interface EndpointStats {
  endpoint: string
  method: string
  count: number
  p50: number
  p95: number
  p99: number
  avg: number
  errorCount: number
  errorRate: number
}

export function aggregateByEndpoint(metrics: PerformanceMetric[]): EndpointStats[] {
  const grouped = new Map<string, PerformanceMetric[]>()
  for (const m of metrics) {
    const key = `${m.method} ${m.endpoint}`
    const list = grouped.get(key) || []
    list.push(m)
    grouped.set(key, list)
  }

  return Array.from(grouped.entries()).map(([key, list]) => {
    const times = list.map((m) => m.responseTimeMs)
    const errors = list.filter((m) => m.statusCode >= 400)
    const [method, ...rest] = key.split(' ')
    return {
      endpoint: rest.join(' '),
      method,
      count: list.length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      errorCount: errors.length,
      errorRate: list.length > 0 ? errors.length / list.length : 0,
    }
  })
}

export interface TimeBucket {
  time: string
  count: number
  errorCount: number
  avgResponseTime: number
}

export function bucketByTime(metrics: PerformanceMetric[], bucketMinutes: number): TimeBucket[] {
  const bucketMs = bucketMinutes * 60 * 1000
  const grouped = new Map<number, PerformanceMetric[]>()

  for (const m of metrics) {
    const ts = new Date(m.timestamp).getTime()
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs
    const list = grouped.get(bucketKey) || []
    list.push(m)
    grouped.set(bucketKey, list)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([key, list]) => ({
      time: new Date(key).toISOString(),
      count: list.length,
      errorCount: list.filter((m) => m.statusCode >= 400).length,
      avgResponseTime: Math.round(list.reduce((sum, m) => sum + m.responseTimeMs, 0) / list.length),
    }))
}

export function latencyHistogram(metrics: PerformanceMetric[]): { bucket: string; count: number }[] {
  const buckets = [
    { max: 50, label: '<50ms' },
    { max: 100, label: '50-100ms' },
    { max: 200, label: '100-200ms' },
    { max: 500, label: '200-500ms' },
    { max: 1000, label: '500ms-1s' },
    { max: 2000, label: '1-2s' },
    { max: 5000, label: '2-5s' },
    { max: Infinity, label: '>5s' },
  ]

  const counts = new Array(buckets.length).fill(0)
  for (const m of metrics) {
    for (let i = 0; i < buckets.length; i++) {
      if (m.responseTimeMs < buckets[i].max || i === buckets.length - 1) {
        counts[i]++
        break
      }
    }
  }

  return buckets.map((b, i) => ({ bucket: b.label, count: counts[i] }))
}
