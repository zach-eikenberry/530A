/**
 * Anonymized event batching (§2.1): events queue in memory and flush as ONE
 * beacon per session (pagehide), conserving the Workers request budget.
 * No identifiers, no PII — event names, coarse buckets, and the page path
 * only. Disabled entirely unless PUBLIC_EVENTS_ENDPOINT is configured.
 */

const endpoint = import.meta.env.PUBLIC_EVENTS_ENDPOINT as string | undefined

interface AnalyticsEvent {
  /** Event name, e.g. "scenario_modeled". */
  n: string
  /** Coarse value bucket (e.g. order of magnitude), never exact user input. */
  b?: string
  /** Page path the event fired on (site-defined routes, not user data). */
  p?: string
}

const queue: AnalyticsEvent[] = []
let wired = false

export function track(name: string, bucket?: string): void {
  if (!endpoint) return
  if (queue.length >= 50) return // hard cap per session
  const event: AnalyticsEvent = { n: name, p: location.pathname.slice(0, 64) }
  if (bucket !== undefined) event.b = bucket.slice(0, 16)
  queue.push(event)
  if (!wired) {
    wired = true
    addEventListener('pagehide', flush)
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
}

/** Track a name at most once per page view (e.g. widget_interacted). */
const seenOnce = new Set<string>()
export function trackOnce(name: string, bucket?: string): void {
  if (seenOnce.has(name)) return
  seenOnce.add(name)
  track(name, bucket)
}

/** Order-of-magnitude bucket for a dollar value — coarse by design. */
export function magnitudeBucket(dollars: number): string {
  if (dollars <= 0) return '0'
  return `1e${Math.floor(Math.log10(dollars))}`
}

function flush(): void {
  if (!endpoint || queue.length === 0) return
  const body = JSON.stringify({ v: 1, events: queue.splice(0) })
  navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
}
