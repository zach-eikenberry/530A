/**
 * Daily stats rollup (§U2.3): a scheduled worker that queries the Analytics
 * Engine SQL API for aggregate event counts and caches them in KV, plus a
 * tiny fetch handler that serves the cached JSON publicly (CORS-limited to
 * the site). Requires an AE read token (AE_API_TOKEN secret); without it the
 * cron no-ops and the endpoint serves whatever was last cached — so the site
 * can ship ahead of the token being provisioned.
 */

export interface Env {
  STATS_KV: KVNamespace
  /** Cloudflare account id (same personal account as everything else). */
  ACCOUNT_ID: string
  /** Analytics Engine SQL API read token — provisioned manually. */
  AE_API_TOKEN?: string
  SENTRY_DSN?: string
}

const DATASET = 'site_events'
const KV_KEY = 'stats-v1'

const ALLOWED_ORIGINS = new Set([
  'https://530amodel.com',
  'https://www.530amodel.com',
  'https://530a-model.pages.dev',
])

export interface PublicStats {
  updatedAt: string
  /** Event name → total count over the window. */
  totals: Record<string, number>
  windowDays: number
}

async function queryTotals(env: Env): Promise<Record<string, number>> {
  const sql = `
    SELECT blob1 AS event, SUM(_sample_interval * double1) AS total
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '90' DAY
    GROUP BY blob1
    ORDER BY total DESC
    FORMAT JSON
  `
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.AE_API_TOKEN}` },
      body: sql,
    },
  )
  if (!res.ok) throw new Error(`AE SQL API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const payload = (await res.json()) as { data?: { event: string; total: number }[] }
  const totals: Record<string, number> = {}
  for (const row of payload.data ?? []) {
    if (row.event) totals[row.event] = Math.round(Number(row.total) || 0)
  }
  return totals
}

function corsHeaders(origin: string | null): Record<string, string> {
  return ALLOWED_ORIGINS.has(origin ?? '')
    ? { 'Access-Control-Allow-Origin': origin as string, Vary: 'Origin' }
    : {}
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.AE_API_TOKEN) return // token not provisioned yet — nothing to do
    try {
      const totals = await queryTotals(env)
      const stats: PublicStats = {
        updatedAt: new Date().toISOString().slice(0, 10),
        totals,
        windowDays: 90,
      }
      await env.STATS_KV.put(KV_KEY, JSON.stringify(stats))
    } catch (e) {
      // Cron has no Request for the Toucan reporter — worker logs suffice here.
      console.error('rollup.scheduled failed:', e instanceof Error ? e.message : e)
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method !== 'GET' || url.pathname !== '/v1/stats') {
      return new Response('not found', { status: 404, headers: corsHeaders(origin) })
    }
    const cached = await env.STATS_KV.get(KV_KEY)
    if (!cached) {
      return new Response(JSON.stringify({ updatedAt: null, totals: {}, windowDays: 90 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }
    return new Response(cached, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        ...corsHeaders(origin),
      },
    })
  },
}
