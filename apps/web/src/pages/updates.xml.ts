import { CANONICAL_ORIGIN } from '@530a/config'
import type { APIRoute } from 'astro'
import { updates } from '../data/updates'

/**
 * RSS feed for /updates — mirrors pledges.xml so return visitors and
 * answer engines can subscribe to rule re-verifications and releases.
 * Built from the same data module as the page, so they can never disagree.
 */

const esc = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const rfc822 = (iso: string) => new Date(`${iso}T12:00:00Z`).toUTCString()

export const GET: APIRoute = () => {
  const items = updates
    .map(
      (u, i) => `    <item>
      <title>${esc(u.title)}</title>
      <link>${CANONICAL_ORIGIN}/updates/</link>
      <guid isPermaLink="false">530a-update-${u.date}-${i}</guid>
      <pubDate>${rfc822(u.date)}</pubDate>
      <description>${esc(u.text)}</description>
    </item>`,
    )
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>530A Model Updates</title>
    <link>${CANONICAL_ORIGIN}/updates/</link>
    <atom:link href="${CANONICAL_ORIGIN}/updates.xml" rel="self" type="application/rss+xml"/>
    <description>Dated changelog of 530amodel.com: rule re-verifications against primary sources, new guides, and calculator releases.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`
  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
