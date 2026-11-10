/**
 * Higher-order wrapper that instruments a Next.js API route handler
 * with automatic performance metrics recording.
 *
 * Usage:
 *   export const GET = withMetrics(async (request: NextRequest) => { ... })
 */
import { NextRequest, NextResponse } from 'next/server'
import { recordMetric } from '@/utils/performanceService'
import { currentLogContext, flushLogs, log, withLogContext } from '@/utils/logger'

// Context shape varies per route (some use { params }, some take none) so
// the contract here is intentionally permissive — the wrapped handler still
// has its own concrete typed signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context?: any) => Promise<NextResponse | Response> | NextResponse | Response

export function withMetrics<T extends RouteHandler>(handler: T): T {
  const wrapped = async (request: NextRequest, context?: unknown) => {
    const pathname = request.nextUrl.pathname
    const logContext = {
      endpoint: pathname,
      method: request.method,
      userType: request.headers.get('x-user-type') || (request.headers.get('x-admin-id') ? 'admin' : undefined),
      userId: request.headers.get('x-user-id') || request.headers.get('x-admin-id') || undefined,
    }

    return withLogContext(logContext, async () => {
      const start = performance.now()
      let statusCode = 200

      try {
        const response = await handler(request, context)
        statusCode = response instanceof NextResponse ? response.status : (response as Response).status
        return response
      } catch (err) {
        statusCode = 500
        log.error('Route handler threw', { error: err })
        throw err
      } finally {
        const responseTimeMs = Math.round(performance.now() - start)

        // Awaited below: a write left in flight when Amplify freezes the
        // function goes out on thaw with an expired signature, and is refused.
        const metricWritten = recordMetric({
          endpoint: pathname,
          method: request.method,
          statusCode,
          responseTimeMs,
          timestamp: new Date().toISOString(),
          userId: request.headers.get('x-user-id') || undefined,
        }).catch(() => {})

        // One line per request. A 5xx whose cause was already logged adds
        // nothing to it; a 401 is a signed-out poll, not something to look at.
        const fields = { type: 'api_request', statusCode, responseTimeMs }
        if (statusCode >= 500) {
          if (!currentLogContext()?.errorLogged) log.error(`HTTP ${statusCode} ${request.method} ${pathname}`, fields)
        } else if (statusCode >= 400 && statusCode !== 401) {
          log.warn(`HTTP ${statusCode} ${request.method} ${pathname}`, fields)
        } else {
          log.info(`HTTP ${statusCode} ${request.method} ${pathname}`, fields)
        }

        // Amplify freezes the function once it responds: the metric and what
        // this request logged (a failed metric write included) have to be
        // written before then.
        await metricWritten
        await flushLogs()
      }
    })
  }
  return wrapped as T
}
