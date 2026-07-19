import { Toucan } from 'toucan-js'

/**
 * Worker-side error reporting: unexpected exceptions only, same errors-only
 * posture as the browser setup (no tracing, no PII — headers stripped). The
 * DSN is ingest-only and public by design; unset in dev/tests → inert.
 */
export function reportError(
  e: unknown,
  opts: {
    dsn: string | undefined
    request: Request
    ctx: ExecutionContext | undefined
    environment: string
  },
): void {
  if (!opts.dsn) return
  try {
    const sentry = new Toucan({
      dsn: opts.dsn,
      request: opts.request,
      ...(opts.ctx ? { context: opts.ctx } : {}),
      environment: opts.environment,
      requestDataOptions: { allowedHeaders: [], allowedSearchParams: [] },
    })
    sentry.captureException(e)
  } catch {
    // Reporting must never break the request.
  }
}
