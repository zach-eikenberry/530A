/**
 * Minimal RSS/Atom ingestion helpers (§7): parse, sanitize, validate.
 * Scraped text is UNTRUSTED (§12.1c): everything is stripped to plain text
 * here and rendered as text (never HTML) downstream.
 */

export interface FeedItem {
  title: string
  link: string
  excerpt: string
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

/** Strip tags/CDATA and collapse whitespace → plain text only. */
export function toPlainText(s: string): string {
  return decodeEntities(
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function pick(block: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  return m?.[1] ?? ''
}

/** Parse RSS 2.0 <item> or Atom <entry> blocks. Tolerant, text-only output. */
export function parseFeed(xml: string, maxItems: number): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0])

  const items: FeedItem[] = []
  for (const block of blocks) {
    if (items.length >= maxItems) break
    const title = toPlainText(pick(block, 'title'))
    // RSS: <link>url</link>; Atom: <link href="url"/>
    let link = toPlainText(pick(block, 'link'))
    if (!link) {
      const href = /<link[^>]*href="([^"]+)"/i.exec(block)
      link = href?.[1] ? decodeEntities(href[1]) : ''
    }
    const excerpt = toPlainText(
      pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'),
    ).slice(0, 280)
    if (title && link) items.push({ title: title.slice(0, 200), link, excerpt })
  }
  return items
}

const SPAM_PATTERNS =
  /\b(viagra|casino|crypto\s*giveaway|forex|xxx|porn|escort|loan\s*approval|winner!!|claim\s+your\s+prize)\b/i

export interface ValidationResult {
  ok: boolean
  reason?: string
}

/** Automated validation (§2.6 Tier A gate). Content-only checks here;
 *  reachability is checked separately (network). */
export function validateItem(item: FeedItem): ValidationResult {
  let url: URL
  try {
    url = new URL(item.link)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not-https' }
  if (item.title.length < 8) return { ok: false, reason: 'title-too-short' }
  if (SPAM_PATTERNS.test(`${item.title} ${item.excerpt}`)) return { ok: false, reason: 'spam' }
  return { ok: true }
}

/** Stable dedupe key: normalized URL without tracking params. */
export async function dedupeHash(link: string): Promise<string> {
  const url = new URL(link)
  for (const p of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref)/i.test(p)) url.searchParams.delete(p)
  }
  url.hash = ''
  const normalized = url.toString().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
