import { describe, expect, it } from 'vitest'
import { dedupeHash, parseFeed, toPlainText, validateItem } from '../src/rss'

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Foundation pledges $1,000 per newborn</title>
<link>https://news.example/story?id=1&amp;utm_source=alerts</link>
<description><![CDATA[<b>Big news:</b> a foundation announced &amp; confirmed a gift.]]></description></item>
<item><title>Short</title><link>https://news.example/2</link><description>too short title</description></item>
<item><title>Crypto giveaway winner!! claim your prize</title><link>https://spam.example/x</link><description>spam</description></item>
<item><title>Insecure link should be rejected</title><link>http://insecure.example/y</link><description>plain http</description></item>
</channel></rss>`

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Statewide 530A match program announced</title>
<link href="https://state.example/match?a=1"/>
<summary>Officials said the program covers children born 2025-2028.</summary></entry>
</feed>`

describe('parseFeed', () => {
  it('parses RSS items with CDATA and entities to plain text', () => {
    const items = parseFeed(RSS, 20)
    expect(items).toHaveLength(4)
    expect(items[0]?.title).toBe('Foundation pledges $1,000 per newborn')
    expect(items[0]?.excerpt).toBe('Big news: a foundation announced & confirmed a gift.')
  })

  it('parses Atom entries with href links', () => {
    const items = parseFeed(ATOM, 20)
    expect(items[0]?.link).toBe('https://state.example/match?a=1')
    expect(items[0]?.excerpt).toContain('born 2025-2028')
  })

  it('caps items per run', () => {
    expect(parseFeed(RSS, 2)).toHaveLength(2)
  })
})

describe('validateItem', () => {
  const items = parseFeed(RSS, 20)
  it('accepts the good item, rejects short titles, spam, and http', () => {
    expect(validateItem(items[0]!).ok).toBe(true)
    expect(validateItem(items[1]!)).toEqual({ ok: false, reason: 'title-too-short' })
    expect(validateItem(items[2]!)).toEqual({ ok: false, reason: 'spam' })
    expect(validateItem(items[3]!)).toEqual({ ok: false, reason: 'not-https' })
  })
})

describe('dedupeHash', () => {
  it('normalizes tracking params and case so duplicates collide', async () => {
    const a = await dedupeHash('https://News.example/story?id=1&utm_source=alerts&fbclid=zzz')
    const b = await dedupeHash('https://news.example/story?id=1')
    expect(a).toBe(b)
    const c = await dedupeHash('https://news.example/story?id=2')
    expect(c).not.toBe(b)
  })
})

describe('toPlainText', () => {
  it('strips tags and never lets markup through (stored-XSS guard)', () => {
    expect(toPlainText('<script>alert(1)</script>Safe &lt;text&gt;')).toBe('alert(1) Safe <text>')
    expect(toPlainText('a<img src=x onerror=alert(1)>b')).toBe('a b')
  })
})
