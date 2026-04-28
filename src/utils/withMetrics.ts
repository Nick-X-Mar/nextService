/**
 * Higher-order wrapper that instruments a Next.js API route handler
 * with automatic performance metrics recording.
 *
 * Usage:
 *   export const GET = withMetrics(async (request: NextRequest) => { ... })
 */
import { NextRequest, NextResponse } from 'next/server'
import { recordMetric } from '@/utils/performanceService'

// Context shape varies per route (some use { params }, some take none) so
// the contract here is intentionally permissive — the wrapped handler still
// has its own concrete typed signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context?: any) => Promise<NextResponse | Response> | NextResponse | Response

export function withMetrics<T extends RouteHandler>(handler: T): T {
  const wrapped = async (request: NextRequest, context?: unknown) => {
    const start = performance.now()
    let statusCode = 200

    try {
      const response = await handler(request, context)
      statusCode = response instanceof NextResponse ? response.status : (response as Response).status
      return response
    } catch (err) {
      statusCode = 500
      throw err
    } finally {
      const responseTimeMs = Math.round(performance.now() - start)
      const pathname = request.nextUrl.pathname

      // Fire-and-forget — don't block the response
      recordMetric({
        endpoint: pathname,
        method: request.method,
        statusCode,
        responseTimeMs,
        timestamp: new Date().toISOString(),
        userId: request.headers.get('x-user-id') || undefined,
      }).catch(() => {})

      // Structured log
      console.log(JSON.stringify({
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        type: 'api_request',
        endpoint: pathname,
        method: request.method,
        statusCode,
        responseTimeMs,
        userId: request.headers.get('x-user-id') || 'anonymous',
        timestamp: new Date().toISOString(),
      }))
    }
  }
  return wrapped as T
}
