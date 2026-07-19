import { openApiSpec } from './openapi'
import { buildReturnsPayload } from './returns'
import { BadRequest, legalFacts, runScenario, stateFromInput } from './shared'

/**
 * Public Calculator API (§7A.2): stateless JSON over the pure engine.
 * Deterministic responses are cached by a hash of the input (Cache API), so
 * the hot path for agents is a cache hit with ~zero CPU. No auth, no PII,
 * stores nothing. Read-only computation only.
 */

export interface Env {
  /** Optional so local dev/tests run without the binding; prod has it. */
  RATE_LIMITER?: RateLimit
}

/** Per-IP limit check; fails open so a limiter outage never downs the API. */
export async function rateLimited(
  limiter: RateLimit | undefined,
  request: Request,
): Promise<boolean> {
  if (!limiter) return false
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  try {
    return !(await limiter.limit({ key })).success
  } catch {
    return false
  }
}

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  })
}

async function cacheKeyFor(bodyText: string): Promise<Request> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText))
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return new Request(`https://cache.530amodel.com/v1/project/${hash}`)
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (request.method === 'GET' && url.pathname === '/v1/rules') {
      return json(legalFacts(), 200, { 'Cache-Control': 'public, max-age=86400' })
    }

    if (request.method === 'GET' && url.pathname === '/v1/returns') {
      // Live market data, refreshed at most every 6h via the edge cache; the
      // upstream fetch is throttled like other uncached work.
      const cacheKey = new Request('https://cache.530amodel.com/v1/returns')
      const cache = (globalThis as { caches?: CacheStorage }).caches?.default
      if (cache) {
        const hit = await cache.match(cacheKey)
        if (hit) {
          const res = new Response(hit.body, hit)
          res.headers.set('X-Cache', 'HIT')
          return res
        }
      }
      if (await rateLimited(env.RATE_LIMITER, request)) {
        return json({ error: 'rate limited, retry shortly' }, 429, { 'Retry-After': '60' })
      }
      const payload = await buildReturnsPayload()
      const anyData = Object.values(payload.funds).some((f) =>
        Object.values(f).some((v) => v !== null),
      )
      const res = json(payload, anyData ? 200 : 503, {
        // Upstream failure caches briefly so we retry soon, not for 6h.
        'Cache-Control': anyData ? 'public, max-age=21600' : 'public, max-age=300',
        'X-Cache': 'MISS',
      })
      if (cache && anyData) await cache.put(cacheKey, res.clone())
      return res
    }
    if (
      request.method === 'GET' &&
      (url.pathname === '/openapi.json' || url.pathname === '/v1/openapi.json')
    ) {
      return json(openApiSpec, 200, { 'Cache-Control': 'public, max-age=86400' })
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        name: '530A Model public API',
        docs: 'https://530amodel.com/api',
        openapi: '/openapi.json',
        endpoints: {
          'POST /v1/project': 'run a projection',
          'GET /v1/rules': 'verified legal facts',
          'GET /v1/returns': 'live trailing returns for the eligible funds',
        },
      })
    }

    if (request.method === 'POST' && url.pathname === '/v1/project') {
      const bodyText = await request.text()
      if (bodyText.length > 16_384) return json({ error: 'payload too large' }, 413)

      // Deterministic ⇒ cacheable: same body → same result
      const cacheKey = await cacheKeyFor(bodyText)
      const cache = (globalThis as { caches?: CacheStorage }).caches?.default
      if (cache) {
        const hit = await cache.match(cacheKey)
        if (hit) {
          const res = new Response(hit.body, hit)
          res.headers.set('X-Cache', 'HIT')
          return res
        }
      }

      // Only uncached work is throttled: hits stay free for agent loops,
      // and an attacker can't burn CPU by varying the body.
      if (await rateLimited(env.RATE_LIMITER, request)) {
        return json({ error: 'rate limited, retry shortly' }, 429, { 'Retry-After': '60' })
      }

      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(bodyText)
      } catch {
        return json({ error: 'invalid JSON' }, 400)
      }

      try {
        const state = stateFromInput(parsedBody)
        const result = runScenario(state)
        const res = json(result, 200, {
          'Cache-Control': 'public, max-age=604800',
          'X-Cache': 'MISS',
        })
        if (cache) await cache.put(cacheKey, res.clone())
        return res
      } catch (e) {
        if (e instanceof BadRequest) return json({ error: e.message }, 400)
        if (e instanceof RangeError) return json({ error: e.message }, 400)
        return json({ error: 'internal error' }, 500)
      }
    }

    return json({ error: 'not found', docs: 'https://530amodel.com/api' }, 404)
  },
}
