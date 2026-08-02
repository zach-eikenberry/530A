/**
 * Error tracking (§13): errors only — no tracing (Cloudflare Web Analytics
 * covers RUM performance cookielessly), no session replay, no PII. The DSN
 * is public by design (it can only ingest, not read). Loaded lazily at idle
 * so content pages keep a 0 KB critical-path bundle; errors thrown before
 * Sentry loads are buffered and flushed once it initializes.
 */
const dsn = import.meta.env.PUBLIC_SENTRY_DSN

if (dsn) {
  type Buffered = { kind: 'error'; event: ErrorEvent } | { kind: 'rejection'; reason: unknown }
  const buffered: Buffered[] = []
  const onError = (event: ErrorEvent) => buffered.push({ kind: 'error', event })
  const onRejection = (e: PromiseRejectionEvent) =>
    buffered.push({ kind: 'rejection', reason: e.reason })
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection)

  const load = async () => {
    const { init, captureException } = await import('@sentry/browser')
    init({
      dsn,
      // Keep all errors while traffic is small; drop below 1.0 at scale.
      sampleRate: 1.0,
      sendDefaultPii: false,
      // Third-party noise, not our code: the Cloudflare analytics beacon
      // failing on pre-Array.prototype.at browsers, and injected/extension
      // scripts. Our own bundles all live under /_astro/.
      denyUrls: [
        /static\.cloudflareinsights\.com/,
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
        /^safari-(web-)?extension:\/\//,
      ],
      ignoreErrors: [/has no method 'updateFrom'/],
      beforeSend(event) {
        // Belt-and-braces: the site never handles PII; strip request headers.
        if (event.request?.headers) delete event.request.headers
        return event
      },
    })
    removeEventListener('error', onError)
    removeEventListener('unhandledrejection', onRejection)
    for (const b of buffered.splice(0)) {
      captureException(b.kind === 'error' ? (b.event.error ?? b.event.message) : b.reason)
    }
  }

  if ('requestIdleCallback' in window) requestIdleCallback(() => void load())
  else setTimeout(() => void load(), 2000)
}
