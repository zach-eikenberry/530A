/**
 * Post-build CSP generation (§7 hardening): Astro emits inline hydration
 * scripts, so a useful Content-Security-Policy needs per-build sha256
 * hashes. This runs after `astro build`, scans every dist HTML file, and inserts
 * the policy (plus HSTS/COOP) into dist/_headers. It FAILS the build if any
 * page carries an inline event handler or a javascript: URL — those cannot
 * be covered by hashes and must not ship.
 *
 * connect-src is derived from the same env vars the client bundles bake in
 * (PUBLIC_EVENTS_ENDPOINT, PUBLIC_SENTRY_DSN), so the policy always matches
 * what the build actually talks to.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Origins the client fetches beyond its own (see AdminQueue.tsx). */
export const NEWSFEED_ORIGIN = 'https://530a-newsfeed.personal-account-fd8.workers.dev'

/** Public API origin (live fund returns; see returns-client.ts). */
export const API_ORIGIN = 'https://api.530amodel.com'

/** Same-site aliases: the site is served on both the apex and Pages domains. */
const SITE_ORIGINS = ['https://530amodel.com', 'https://530a-model.pages.dev']

const EXECUTABLE_TYPES = new Set(['module', 'text/javascript', 'application/javascript'])

/** Inline executable <script> bodies (JSON-LD and other data blocks excluded). */
export function extractInlineScripts(html) {
  const out = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const [, attrs, body] = m
    if (/\bsrc\s*=/i.test(attrs)) continue
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase()
    if (type && !EXECUTABLE_TYPES.has(type)) continue
    out.push(body)
  }
  return out
}

/** CSP source token for one inline script body. */
export function scriptHash(body) {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
}

/** Inline handlers / javascript: URLs that hashes cannot cover. */
export function findUnhashableInline(html) {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const problems = []
  for (const m of withoutScripts.matchAll(/<[a-z][^>]*\son[a-z]+\s*=/gi)) {
    problems.push(`inline event handler: ${m[0].slice(0, 80)}`)
  }
  for (const m of withoutScripts.matchAll(/(?:href|src|action)\s*=\s*["']?javascript:/gi)) {
    problems.push(`javascript: URL: ${m[0].slice(0, 80)}`)
  }
  return problems
}

/** Origin (scheme://host) of a URL-ish env value, or null if unset/invalid. */
export function originOf(value) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function buildCsp({ scriptHashes, connectOrigins }) {
  const scriptSrc = ["'self'", ...[...scriptHashes].sort()].join(' ')
  const connectSrc = ["'self'", ...[...new Set(connectOrigins)].filter(Boolean).sort()].join(' ')
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Built HTML carries style="" attributes (charts, cards); hashes cannot
    // cover attributes, so styles allow inline. Scripts stay hash-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(p)
    else if (entry.name.endsWith('.html')) yield p
  }
}

/** Insert extra header lines into the catch-all `/*` block of a _headers file. */
export function insertHeaders(headersText, lines) {
  if (/content-security-policy/i.test(headersText)) {
    throw new Error('_headers already contains a Content-Security-Policy line')
  }
  const rows = headersText.split('\n')
  const i = rows.indexOf('/*')
  if (i === -1) throw new Error('_headers has no /* block to extend')
  rows.splice(i + 1, 0, ...lines.map((l) => `  ${l}`))
  return rows.join('\n')
}

function main() {
  const dist = fileURLToPath(new URL('../dist', import.meta.url))
  const hashes = new Set()
  const problems = []
  let pages = 0
  for (const file of htmlFiles(dist)) {
    pages++
    const html = readFileSync(file, 'utf8')
    for (const p of findUnhashableInline(html)) problems.push(`${file}: ${p}`)
    for (const body of extractInlineScripts(html)) hashes.add(scriptHash(body))
  }
  if (pages === 0) throw new Error(`no HTML found under ${dist} — run astro build first`)
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    throw new Error(`${problems.length} inline pattern(s) a hash-based CSP cannot cover`)
  }

  const csp = buildCsp({
    scriptHashes: hashes,
    connectOrigins: [
      ...SITE_ORIGINS,
      NEWSFEED_ORIGIN,
      API_ORIGIN,
      originOf(process.env.PUBLIC_EVENTS_ENDPOINT),
      originOf(process.env.PUBLIC_SENTRY_DSN),
    ],
  })

  const headersPath = join(dist, '_headers')
  const updated = insertHeaders(readFileSync(headersPath, 'utf8'), [
    `Content-Security-Policy: ${csp}`,
    'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    'Cross-Origin-Opener-Policy: same-origin',
  ])
  writeFileSync(headersPath, updated)
  console.log(`CSP written to dist/_headers: ${pages} pages, ${hashes.size} inline script hashes`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
