import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { type Env, runIngest } from '../src/newsfeed'

/**
 * In-memory D1 stub covering the exact SQL shapes the worker uses.
 * Rows live in an array; INSERT OR IGNORE enforces dedupe_hash uniqueness.
 */
interface Row {
  id: number
  dedupe_hash: string
  title: string
  excerpt: string
  source_url: string
  source_domain: string
  tier: string
  status: string
  amount_cents: number | null
  recurring: number
  qualifies_note: string | null
  birth_year_start: number | null
  birth_year_end: number | null
  created_at: string
  published_at: string | null
  reviewed_by: string | null
  review_note: string | null
}

function makeDb() {
  const rows: Row[] = []
  let nextId = 1
  const db = {
    rows,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith('INSERT OR IGNORE')) {
                const [hash, title, excerpt, url, domain, ...rest] = args as string[]
                if (rows.some((r) => r.dedupe_hash === hash)) {
                  return { meta: { changes: 0 } }
                }
                rows.push({
                  id: nextId++,
                  dedupe_hash: hash as string,
                  title: title as string,
                  excerpt: excerpt as string,
                  source_url: url as string,
                  source_domain: domain as string,
                  tier: 'A',
                  status: 'published',
                  amount_cents: null,
                  recurring: 0,
                  qualifies_note: null,
                  birth_year_start: null,
                  birth_year_end: null,
                  created_at: rest[0] as string,
                  published_at: (rest[1] as string) ?? null,
                  reviewed_by: sql.includes("'admin'") ? 'admin' : null,
                  review_note: null,
                })
                return { meta: { changes: 1 } }
              }
              if (sql.startsWith('UPDATE') && sql.includes("tier='B'")) {
                const id = args[7] as number
                const row = rows.find((r) => r.id === id)
                if (!row) return { meta: { changes: 0 } }
                Object.assign(row, {
                  tier: 'B',
                  status: 'published',
                  amount_cents: args[0],
                  recurring: args[1],
                  qualifies_note: args[2],
                  birth_year_start: args[3],
                  birth_year_end: args[4],
                  review_note: args[5],
                  published_at: args[6],
                  reviewed_by: 'admin',
                })
                return { meta: { changes: 1 } }
              }
              if (sql.startsWith('UPDATE')) {
                const id = args[2] as number
                const row = rows.find((r) => r.id === id)
                if (!row) return { meta: { changes: 0 } }
                Object.assign(row, { status: args[0], review_note: args[1], reviewed_by: 'admin' })
                return { meta: { changes: 1 } }
              }
              throw new Error(`unhandled sql: ${sql}`)
            },
          }
        },
        async all() {
          if (sql.includes("status='published'")) {
            return { results: rows.filter((r) => r.status === 'published') }
          }
          return { results: rows }
        },
      }
    },
  }
  return db as unknown as D1Database & { rows: Row[] }
}

const TOKEN = 'test-admin-token-0123456789abcdef'

function makeEnv(overrides: Partial<Env> = {}): Env & { DB: D1Database & { rows: Row[] } } {
  return {
    DB: makeDb(),
    FEED_URLS: '',
    DEPLOY_HOOK_URL: '',
    ADMIN_TOKEN: TOKEN,
    ...overrides,
  } as Env & { DB: D1Database & { rows: Row[] } }
}

const FEED_XML = `<rss><channel>
<item><title>Foundation pledges $1,000 per newborn in Ohio</title>
<link>https://news.example/ohio</link><description>A real story.</description></item>
<item><title>Casino crypto giveaway winner!!</title>
<link>https://spam.example/no</link><description>claim your prize</description></item>
</rss>`

afterEach(() => vi.unstubAllGlobals())

describe('ingest', () => {
  it('publishes validated items as Tier A and skips spam; dedupes on re-run', async () => {
    const env = makeEnv({ FEED_URLS: 'https://alerts.example/rss' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes('alerts.example')) return new Response(FEED_XML)
        if (init?.method === 'HEAD') return new Response(null, { status: 200 })
        return new Response(null, { status: 404 })
      }),
    )
    const first = await runIngest(env, '2026-07-13T12:00:00Z')
    expect(first.inserted).toBe(1)
    expect(env.DB.rows[0]?.tier).toBe('A')
    expect(env.DB.rows[0]?.amount_cents).toBeNull()

    const second = await runIngest(env, '2026-07-13T18:00:00Z')
    expect(second.inserted).toBe(0)
  })

  it('never creates Tier B from ingest (§2.6: model-affecting needs a human)', async () => {
    const env = makeEnv({ FEED_URLS: 'https://alerts.example/rss' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
        String(url).includes('alerts.example')
          ? new Response(FEED_XML)
          : new Response(null, { status: init?.method === 'HEAD' ? 200 : 404 }),
      ),
    )
    await runIngest(env, '2026-07-13T12:00:00Z')
    expect(env.DB.rows.every((r) => r.tier === 'A')).toBe(true)
  })
})

function adminPost(body: unknown, token = TOKEN): Request {
  return new Request('https://feed.example/admin/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('admin queue', () => {
  it('rejects missing/wrong tokens and refuses to run without a configured token', async () => {
    const env = makeEnv()
    expect((await handler.fetch(adminPost({ action: 'reject', id: 1 }, 'wrong'), env)).status).toBe(
      401,
    )
    const { ADMIN_TOKEN: _drop, ...rest } = makeEnv()
    const noToken = rest as Env & { DB: D1Database & { rows: Row[] } }
    expect((await handler.fetch(adminPost({ action: 'reject', id: 1 }), noToken)).status).toBe(401)
  })

  it('promotes an item to Tier B with structured, validated fields', async () => {
    const env = makeEnv()
    await handler.fetch(
      adminPost({
        action: 'create',
        title: 'County program gives $500 to newborns',
        excerpt: 'Announced this week.',
        sourceUrl: 'https://county.example/news',
      }),
      env,
    )
    const res = await handler.fetch(
      adminPost({
        action: 'promote',
        id: 1,
        amountCents: 50_000,
        recurring: false,
        qualifiesNote: 'Children born in Example County',
        birthYearStart: 2025,
        birthYearEnd: 2028,
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(env.DB.rows[0]?.tier).toBe('B')
    expect(env.DB.rows[0]?.amount_cents).toBe(50_000)
  })

  it('validates promote payloads (bad year window, absurd amounts)', async () => {
    const env = makeEnv()
    const bad = await handler.fetch(
      adminPost({
        action: 'promote',
        id: 1,
        amountCents: 50_000,
        recurring: false,
        qualifiesNote: 'x'.repeat(10),
        birthYearStart: 2028,
        birthYearEnd: 2025,
      }),
      env,
    )
    expect(bad.status).toBe(400)
    const absurd = await handler.fetch(
      adminPost({
        action: 'promote',
        id: 1,
        amountCents: 999_999_999_999,
        recurring: false,
        qualifiesNote: 'Everyone everywhere',
        birthYearStart: 2025,
        birthYearEnd: 2028,
      }),
      env,
    )
    expect(absurd.status).toBe(400)
  })

  it('reject removes an item from the public feed', async () => {
    const env = makeEnv()
    await handler.fetch(
      adminPost({
        action: 'create',
        title: 'A story that turns out to be wrong',
        sourceUrl: 'https://news.example/wrong',
      }),
      env,
    )
    await handler.fetch(adminPost({ action: 'reject', id: 1, note: 'source retracted' }), env)
    const feed = await handler.fetch(new Request('https://feed.example/feed.json'), env)
    const data = (await feed.json()) as { items: unknown[] }
    expect(data.items).toHaveLength(0)
  })
})

describe('public feed', () => {
  it('serves published items with disclaimer and cache headers', async () => {
    const env = makeEnv()
    await handler.fetch(
      adminPost({
        action: 'create',
        title: 'Published item headline',
        sourceUrl: 'https://a.example/1',
      }),
      env,
    )
    const res = await handler.fetch(new Request('https://feed.example/feed.json'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('max-age=300')
    const data = (await res.json()) as { items: { title: string }[]; disclaimer: string }
    expect(data.items[0]?.title).toBe('Published item headline')
    expect(data.disclaimer).toContain('third-party sources')
  })
})
