import { init } from '@sentry/browser'

/**
 * Error tracking (§13): errors only — no tracing (Cloudflare Web Analytics
 * covers RUM performance cookielessly), no session replay, no PII. The DSN
 * is public by design (it can only ingest, not read). Sampling keeps us
 * inside Sentry's free tier at scale; tune here if volume grows.
 */
const dsn = import.meta.env.PUBLIC_SENTRY_DSN

if (dsn) {
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
}
