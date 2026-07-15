import { z } from 'zod'

/**
 * Anonymized event beacon (§2.1, §10.2): one POST per session from the
 * client's batched queue → Workers Analytics Engine (built for this write
 * volume). No identifiers, no IPs stored, no cookies — event names and
 * coarse buckets only. Aggregates are read by the daily rollup cron
 * (Phase 6), never per-request.
 */

export interface Env {
  EVENTS: AnalyticsEngineDataset
  /** Optional so local dev/tests run without the binding; prod has it. */
  RATE_LIMITER?: RateLimit
}

/** Per-IP limit; clients beacon once per session, so this only bites abuse. */
async function rateLimited(env: Env, request: Request): Promise<boolean> {
  if (!env.RATE_LIMITER) return false
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  try {
    return !(await env.RATE_LIMITER.limit({ key })).success
  } catch {
    return false
  }
}

const ALLOWED_EVENTS = new Set(['scenario_modeled', 'scenario_saved', 'link_copied', 'export'])

const BodySchema = z.object({
  v: z.literal(1),
  events: z
    .array(
      z.object({
        n: z.string().min(1).max(32),
        b: z.string().min(1).max(16).optional(),
      }),
    )
    .min(1)
    .max(50),
})

const ALLOWED_ORIGINS = new Set([
  'https://530amodel.com',
  'https://www.530amodel.com',
  'https://530a-model.pages.dev',
])

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://530amodel.com'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: corsHeaders(origin) })
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response('forbidden origin', { status: 403 })
    }
    if (await rateLimited(env, request)) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '60', ...corsHeaders(origin) },
      })
    }
    const length = Number(request.headers.get('Content-Length') ?? '0')
    if (length > 8192) {
      return new Response('payload too large', { status: 413, headers: corsHeaders(origin) })
    }

    let parsed: z.infer<typeof BodySchema>
    try {
      parsed = BodySchema.parse(await request.json())
    } catch {
      return new Response('invalid payload', { status: 400, headers: corsHeaders(origin) })
    }

    let written = 0
    for (const event of parsed.events) {
      if (!ALLOWED_EVENTS.has(event.n)) continue
      env.EVENTS.writeDataPoint({
        blobs: [event.n, event.b ?? ''],
        doubles: [1],
        indexes: [event.n],
      })
      written++
    }

    return new Response(JSON.stringify({ ok: true, written }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  },
}
