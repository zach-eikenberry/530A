/**
 * Per-page OpenGraph images (§roadmap 4): runs after `astro build`, reads
 * every dist HTML page's <title>, and renders a 1200×630 PNG per page at
 * dist/assets/og/<slug>.png — the same slug Base.astro predicts for its
 * og:image URL. SVG → PNG via sharp (librsvg), no extra services.
 */

import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const W = 1200
const H = 630

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(p)
    else if (entry.name.endsWith('.html')) yield p
  }
}

/** dist-relative HTML path → the og slug Base.astro computes from the route. */
export function slugFor(rel) {
  const parts = rel.split(sep)
  if (parts.at(-1) === 'index.html') parts.pop()
  else parts.push(parts.pop().replace(/\.html$/, ''))
  return parts.length === 0 ? 'home' : parts.join('-')
}

/** Dist <title> text arrives HTML-entity-encoded — decode before re-escaping. */
export function decodeEntities(s) {
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

const esc = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Greedy word wrap sized for the 64px title font. */
export function wrapTitle(title, maxChars = 30, maxLines = 3) {
  const words = title.split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, maxChars - 1)}…`
  }
  return lines
}

function svgFor(title) {
  // Site suffixes just repeat the footer branding — strip for the big type.
  const short = title.replace(/\s+[—–|]\s+530A Model$/i, '')
  const lines = wrapTitle(short)
  const text = lines
    .map(
      (l, i) =>
        `<text x="80" y="${300 + i * 78}" font-size="64" font-weight="700" fill="#ffffff" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">${esc(l)}</text>`,
    )
    .join('')
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#122a47"/>
      <stop offset="1" stop-color="#081627"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="#d8b96e"/>
  <text x="80" y="150" font-size="30" font-weight="700" letter-spacing="4" fill="#d8b96e" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">530AMODEL.COM</text>
  ${text}
  <text x="80" y="${H - 60}" font-size="26" fill="#90a3c2" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">Free · open source · runs in your browser · not financial advice</text>
</svg>`
}

async function main() {
  const dist = fileURLToPath(new URL('../dist', import.meta.url))
  const outDir = join(dist, 'assets', 'og')
  mkdirSync(outDir, { recursive: true })
  let count = 0
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8')
    const raw = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()
    if (!raw) continue
    const title = decodeEntities(raw)
    const slug = slugFor(relative(dist, file))
    await sharp(Buffer.from(svgFor(title)))
      .png()
      .toFile(join(outDir, `${slug}.png`))
    count++
  }
  if (count === 0) throw new Error(`no HTML pages found under ${dist} — run astro build first`)
  console.log(`OG images written: ${count} pages → dist/assets/og/`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
