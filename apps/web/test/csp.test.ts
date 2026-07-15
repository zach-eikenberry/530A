import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain-JS build script, no declaration file
import {
  buildCsp,
  extractInlineScripts,
  findUnhashableInline,
  insertHeaders,
  originOf,
  scriptHash,
} from '../scripts/csp.mjs'

describe('extractInlineScripts', () => {
  it('collects executable inline scripts and skips data blocks', () => {
    const html = `
      <script>console.log(1)</script>
      <script type="module">import x from '/y.js'</script>
      <script type="application/ld+json">{"@type":"WebApplication"}</script>
      <script src="/a.js"></script>
      <script type="module" src="/b.js"></script>`
    expect(extractInlineScripts(html)).toEqual(['console.log(1)', "import x from '/y.js'"])
  })

  it('keeps the exact body bytes (hash must match the browser)', () => {
    const body = '\n  let a = 1;\n'
    expect(extractInlineScripts(`<script>${body}</script>`)).toEqual([body])
  })
})

describe('scriptHash', () => {
  it('produces the CSP sha256 token for a known vector', () => {
    // echo -n "alert(1)" | openssl dgst -sha256 -binary | base64
    expect(scriptHash('alert(1)')).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='")
  })
})

describe('findUnhashableInline', () => {
  it('flags inline event handlers and javascript: URLs', () => {
    expect(findUnhashableInline('<button onclick="x()">go</button>')).toHaveLength(1)
    expect(findUnhashableInline('<a href="javascript:void(0)">x</a>')).toHaveLength(1)
  })

  it('accepts clean markup and ignores script bodies', () => {
    expect(findUnhashableInline('<p class="online">fine</p>')).toEqual([])
    expect(findUnhashableInline('<script>el.onclick = fn</script>')).toEqual([])
  })
})

describe('originOf', () => {
  it('reduces URLs to origins and tolerates unset values', () => {
    expect(originOf('https://x.workers.dev/v1/e')).toBe('https://x.workers.dev')
    expect(originOf('https://abc123@o42.ingest.sentry.io/9')).toBe('https://o42.ingest.sentry.io')
    expect(originOf(undefined)).toBeNull()
    expect(originOf('not a url')).toBeNull()
  })
})

describe('buildCsp', () => {
  const csp: string = buildCsp({
    scriptHashes: new Set(["'sha256-bbb='", "'sha256-aaa='"]),
    connectOrigins: ['https://b.example', null, 'https://a.example', 'https://a.example'],
  })

  it('locks scripts to self plus sorted hashes', () => {
    expect(csp).toContain("script-src 'self' 'sha256-aaa=' 'sha256-bbb='")
  })

  it('dedupes and sorts connect-src, dropping unset origins', () => {
    expect(csp).toContain("connect-src 'self' https://a.example https://b.example")
  })

  it('carries the hardening directives', () => {
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "worker-src 'self'",
      'upgrade-insecure-requests',
    ]) {
      expect(csp).toContain(directive)
    }
  })

  it('never allows unsafe-inline scripts or remote script hosts', () => {
    const scriptSrc = csp.split('; ').find((d: string) => d.startsWith('script-src '))
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toMatch(/https?:/)
  })
})

describe('insertHeaders', () => {
  const base = '/*\n  X-Frame-Options: SAMEORIGIN\n/assets/*\n  Cache-Control: immutable\n'

  it('inserts new headers at the top of the catch-all block', () => {
    const out = insertHeaders(base, ['Content-Security-Policy: x'])
    expect(out.split('\n').slice(0, 3)).toEqual([
      '/*',
      '  Content-Security-Policy: x',
      '  X-Frame-Options: SAMEORIGIN',
    ])
  })

  it('refuses to double-insert a CSP', () => {
    const once = insertHeaders(base, ['Content-Security-Policy: x'])
    expect(() => insertHeaders(once, ['Content-Security-Policy: y'])).toThrow()
  })

  it('fails loudly when the catch-all block is missing', () => {
    expect(() => insertHeaders('/assets/*\n  Cache-Control: immutable\n', ['A: b'])).toThrow()
  })
})
