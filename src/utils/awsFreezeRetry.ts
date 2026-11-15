/**
 * Amplify freezes the SSR function the moment a response is sent. Work still in
 * flight — a background ISR regeneration, above all — resumes when the function
 * next thaws, often minutes later, and its AWS call fails in one of two ways:
 *
 *  - "Signature expired": the request was signed before the freeze. The SDK
 *    only retries signature errors it can put down to clock skew, and here the
 *    clocks agree, so it gives up.
 *  - "socket hang up" / EPIPE / ECONNRESET: AWS closed the kept-alive
 *    connections while the function was frozen. The SDK does retry these, but
 *    at once, onto the next dead socket in the pool, until it runs out of
 *    attempts.
 *
 * Either way the call is sent once more from the build step, so it is signed
 * afresh and goes through the SDK's own retries again — after a short pause for
 * a dead connection, which lets Node drop the sockets that closed meanwhile.
 * A refused signature means the call never ran; a dropped connection is what
 * the SDK already retries, writes included.
 */

const EXPIRED = new Set(['RequestExpired', 'RequestTimeTooSkewed'])
const CONNECTION = /socket hang up|EPIPE|ECONNRESET/
const CONNECTION_PAUSE_MS = 250

function isExpiredSignature(err: Error): boolean {
  if (EXPIRED.has(err.name)) return true
  return err.name === 'InvalidSignatureException' && /expired/i.test(err.message)
}

function isDroppedConnection(err: Error): boolean {
  const code = (err as { code?: unknown }).code
  return CONNECTION.test(err.message) || (typeof code === 'string' && CONNECTION.test(code))
}

type Next = (args: unknown) => Promise<unknown>

interface WithMiddleware {
  middlewareStack: {
    add(middleware: (next: Next) => Next, options: { step: 'build'; name: string }): void
  }
}

/** Adds the one retry to an AWS SDK client. Returns the client. */
export function retryAfterFreeze<T>(client: T): T {
  ;(client as unknown as WithMiddleware).middlewareStack.add(
    (next) => async (args) => {
      try {
        return await next(args)
      } catch (err) {
        if (!(err instanceof Error)) throw err
        if (isDroppedConnection(err)) {
          await new Promise((resolve) => setTimeout(resolve, CONNECTION_PAUSE_MS))
        } else if (!isExpiredSignature(err)) {
          throw err
        }
        return next(args)
      }
    },
    { step: 'build', name: 'retryAfterFreeze' }
  )
  return client
}
