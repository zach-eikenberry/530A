import { z } from 'zod'
import { dedupeHash, parseFeed, toPlainText, validateItem } from './rss'

/**
 * Newsfeed worker (§7, safety per §2.6):
 *
 * - Scheduled ingest (bounded cron): RSS feeds → validation → Tier A
 *   display-only items, auto-published with a labeled source excerpt.
 *   NOTHING that can affect a family's modeled number is auto-published:
 *   Tier B (structured $/eligibility) exists only via human promotion.
 * - GET  /feed.json           public, cached — published items
 * - GET  /admin/items         bearer-token admin: review queue
 * - POST /admin/items         bearer-token admin: approve / reject /
 *                             promote-to-B / create
 *
 * Scraped text is sanitized to plain text on ingest and rendered as text.
 */

export interface Env {
  DB: D1Database
  FEED_URLS: string
  DEPLOY_HOOK_URL: string
  ADMIN_TOKEN?: string
}

const MAX_ITEMS_PER_RUN = 20

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  })
}

// ---------- ingest ----------

export async function runIngest(
  env: Env,
  now: string,
): Promise<{ scanned: number; inserted: number }> {
  const feeds = env.FEED_URLS.split(',')
    .map((f) => f.trim())
    .filter(Boolean)
  let scanned = 0
  let inserted = 0
  for (const feed of feeds) {
    let xml: string
    try {
      const res = await fetch(feed, { headers: { 'User-Agent': '530amodel-newsfeed/1.0' } })
      if (!res.ok) continue
      xml = await res.text()
    } catch {
      continue
    }
    for (const item of parseFeed(xml, MAX_ITEMS_PER_RUN)) {
      scanned++
      if (scanned > MAX_ITEMS_PER_RUN) break
      if (!validateItem(item).ok) continue
      // Source reachability (§2.6 automated validation)
      try {
        const head = await fetch(item.link, { method: 'HEAD', redirect: 'follow' })
        if (!head.ok) continue
      } catch {
        continue
      }
      const hash = await dedupeHash(item.link)
      const domain = new URL(item.link).hostname
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO newsfeed_items
         (dedupe_hash, title, excerpt, source_url, source_domain, tier, status, created_at, published_at)
         VALUES (?, ?, ?, ?, ?, 'A', 'published', ?, ?)`,
      )
        .bind(hash, item.title, item.excerpt, item.link, domain, now, now)
        .run()
      if (res.meta.changes > 0) inserted++
    }
  }
  if (inserted > 0 && env.DEPLOY_HOOK_URL) {
    try {
      await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' })
    } catch {
      /* deploy hook is best-effort */
    }
  }
  console.log(`newsfeed ingest: scanned=${scanned} inserted=${inserted} feeds=${feeds.length}`)
  return { scanned, inserted }
}

// ---------- admin ----------

const PromoteSchema = z.object({
  action: z.literal('promote'),
  id: z.number().int().positive(),
  amountCents: z.number().int().min(100).max(100_000_000),
  recurring: z.boolean().default(false),
  qualifiesNote: z.string().min(3).max(300),
  birthYearStart: z.number().int().min(2005).max(2045),
  birthYearEnd: z.number().int().min(2005).max(2045),
  note: z.string().max(300).optional(),
})

const ModerateSchema = z.object({
  action: z.enum(['reject', 'unpublish', 'republish']),
  id: z.number().int().positive(),
  note: z.string().max(300).optional(),
})

const CreateSchema = z.object({
  action: z.literal('create'),
  title: z.string().min(8).max(200),
  excerpt: z.string().max(400).default(''),
  sourceUrl: z.string().url().startsWith('https://'),
})

const AdminSchema = z.union([PromoteSchema, ModerateSchema, CreateSchema])

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) return false
  const header = request.headers.get('Authorization') ?? ''
  return header === `Bearer ${env.ADMIN_TOKEN}`
}

async function handleAdmin(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) return json({ error: 'unauthorized' }, 401)

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM newsfeed_items ORDER BY created_at DESC LIMIT 100`,
    ).all()
    return json({ items: results })
  }

  const now = new Date().toISOString()
  let body: z.infer<typeof AdminSchema>
  try {
    body = AdminSchema.parse(await request.json())
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid body' }, 400)
  }

  if (body.action === 'create') {
    const hash = await dedupeHash(body.sourceUrl)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO newsfeed_items
       (dedupe_hash, title, excerpt, source_url, source_domain, tier, status, created_at, published_at, reviewed_by)
       VALUES (?, ?, ?, ?, ?, 'A', 'published', ?, ?, 'admin')`,
    )
      .bind(
        hash,
        toPlainText(body.title),
        toPlainText(body.excerpt),
        body.sourceUrl,
        new URL(body.sourceUrl).hostname,
        now,
        now,
      )
      .run()
    return json({ ok: true })
  }

  if (body.action === 'promote') {
    if (body.birthYearEnd < body.birthYearStart) {
      return json({ error: 'birthYearEnd before birthYearStart' }, 400)
    }
    const res = await env.DB.prepare(
      `UPDATE newsfeed_items
       SET tier='B', status='published', amount_cents=?, recurring=?, qualifies_note=?,
           birth_year_start=?, birth_year_end=?, reviewed_by='admin', review_note=?, published_at=?
       WHERE id=?`,
    )
      .bind(
        body.amountCents,
        body.recurring ? 1 : 0,
        toPlainText(body.qualifiesNote),
        body.birthYearStart,
        body.birthYearEnd,
        body.note ?? null,
        now,
        body.id,
      )
      .run()
    return res.meta.changes > 0 ? json({ ok: true }) : json({ error: 'not found' }, 404)
  }

  // reject / unpublish / republish
  const status = body.action === 'republish' ? 'published' : 'rejected'
  const res = await env.DB.prepare(
    `UPDATE newsfeed_items SET status=?, reviewed_by='admin', review_note=? WHERE id=?`,
  )
    .bind(status, body.note ?? null, body.id)
    .run()
  return res.meta.changes > 0 ? json({ ok: true }) : json({ error: 'not found' }, 404)
}

// ---------- public feed ----------

async function handleFeed(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, title, excerpt, source_url, source_domain, tier, amount_cents, recurring,
            qualifies_note, birth_year_start, birth_year_end, published_at
     FROM newsfeed_items WHERE status='published'
     ORDER BY published_at DESC LIMIT 50`,
  ).all()
  return json(
    {
      generatedAt: new Date().toISOString(),
      disclaimer:
        'Items are reported from third-party sources with a labeled excerpt; verify with the linked source. Tier B items were human-reviewed before being modelable.',
      items: results,
    },
    200,
    { 'Cache-Control': 'public, max-age=300' },
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/feed.json' && request.method === 'GET') return handleFeed(env)
    if (url.pathname === '/admin/items') return handleAdmin(request, env)
    if (url.pathname === '/ingest' && request.method === 'POST') {
      // manual trigger, admin-gated (useful right after adding a feed URL)
      if (!isAuthorized(request, env)) return json({ error: 'unauthorized' }, 401)
      return json(await runIngest(env, new Date().toISOString()))
    }
    return json({ error: 'not found' }, 404)
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runIngest(env, new Date().toISOString()).then(() => undefined))
  },
}
