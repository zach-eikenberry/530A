import { CANONICAL_ORIGIN } from '@530a/config'
import type { APIRoute } from 'astro'
import { loadPledges } from '../lib/pledges'

/**
 * RSS feed for the pledges page — the site's one updating surface. Built from
 * the same build-time feed as /pledges, so the two can never disagree.
 */

const esc = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const rfc822 = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
}

export const GET: APIRoute = async () => {
  const feed = await loadPledges()
  const items = feed.items
    .map(
      (item) => `    <item>
      <title>${esc(item.title)}</title>
      <link>${esc(item.source_url)}</link>
      <guid isPermaLink="false">530a-pledge-${item.id}</guid>
      <pubDate>${rfc822(item.published_at)}</pubDate>
      <description>${esc(item.excerpt)}</description>
      <source url="${esc(item.source_url)}">${esc(item.source_domain)}</source>
    </item>`,
    )
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>530A Pledges &amp; Gifts</title>
    <link>${CANONICAL_ORIGIN}/pledges</link>
    <atom:link href="${CANONICAL_ORIGIN}/pledges.xml" rel="self" type="application/rss+xml"/>
    <description>Reported pledges, gifts, and programs contributing to 530A ("Trump Account") custodial accounts, tracked by 530A Model.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`
  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
