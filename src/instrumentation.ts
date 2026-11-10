/**
 * Next.js server start-up hook. On a deployed server every console warning and
 * error becomes a structured entry in CloudWatch (`src/utils/logger.ts`), and
 * an error no handler caught — a crashed page render, a route that threw — is
 * logged there with its route before the response goes out.
 *
 * The imports sit inside `NEXT_RUNTIME === 'nodejs'` checks, the form Next
 * strips from the edge bundle: the logger pulls in the AWS SDK, which the
 * edge runtime (middleware) cannot load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installConsoleCapture } = await import('./utils/logger')
    installConsoleCapture()
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { log, flushLogs, alreadyLogged } = await import('./utils/logger')
    if (alreadyLogged(error)) return
    log.error('Unhandled server error', {
      error,
      endpoint: request.path.split('?')[0],
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
    })
    await flushLogs()
  }
}
