/**
 * Anonymized event batching (§2.1): events queue in memory and flush as ONE
 * beacon per session (pagehide), conserving the Workers request budget.
 * No identifiers, no PII — event names and coarse numeric buckets only.
 * Disabled entirely unless PUBLIC_EVENTS_ENDPOINT is configured.
 */

const endpoint = import.meta.env.PUBLIC_EVENTS_ENDPOINT as string | undefined

interface AnalyticsEvent {
  /** Event name, e.g. "scenario_modeled". */
  n: string
  /** Coarse value bucket (e.g. order of magnitude), never exact user input. */
  b?: string
}

const queue: AnalyticsEvent[] = []
let wired = false

export function track(name: string, bucket?: string): void {
  if (!endpoint) return
  if (queue.length >= 50) return // hard cap per session
  const event: AnalyticsEvent = { n: name }
  if (bucket !== undefined) event.b = bucket
  queue.push(event)
  if (!wired) {
    wired = true
    addEventListener('pagehide', flush)
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
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
