import { describe, expect, it } from 'vitest'
import handler from '../src/mcp'

async function rpc(method: string, params?: Record<string, unknown>, id: number | null = 1) {
  const res = await handler.fetch(
    new Request('https://mcp.example/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }),
  )
  return { status: res.status, body: res.status === 202 ? null : await res.json() }
}

describe('MCP server', () => {
  it('initializes with tools capability', async () => {
    const { body } = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    })
    const result = (body as { result: { protocolVersion: string; serverInfo: { name: string } } })
      .result
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.serverInfo.name).toBe('530a-model')
  })

  it('lists both tools with schemas', async () => {
    const { body } = await rpc('tools/list')
    const tools = (body as { result: { tools: { name: string }[] } }).result.tools
    expect(tools.map((t) => t.name)).toEqual(['project_530a', 'explain_530a', 'search', 'fetch'])
  })

  it('project_530a runs end-to-end and carries attribution', async () => {
    const { body } = await rpc('tools/call', {
      name: 'project_530a',
      arguments: {
        asOf: '2026-07-12',
        birthDate: '2026-01-15',
        targetAgeMonths: 216,
        mcPaths: 200,
        sources: [
          {
            id: 'family',
            kind: 'family',
            schedule: {
              type: 'monthly',
              amountCents: '10000',
              startAgeMonths: 6,
              endAgeMonths: 216,
            },
          },
        ],
      },
    })
    const content = (body as { result: { content: { text: string }[] } }).result.content
    const payload = JSON.parse(content[0]?.text ?? '{}')
    expect(payload.sourceUrl).toBe('https://530amodel.com')
    expect(payload.disclaimer).toContain('not financial advice')
    expect(BigInt(payload.deterministic.finalNominalCents)).toBeGreaterThan(0n)
    expect(payload.percentiles.nominalCents).toHaveLength(5)
  })

  it('explain_530a returns verified facts and unverified flags', async () => {
    const { body } = await rpc('tools/call', { name: 'explain_530a', arguments: {} })
    const content = (body as { result: { content: { text: string }[] } }).result.content
    const payload = JSON.parse(content[0]?.text ?? '{}')
    expect(payload.facts.federalSeed).toContain('$1,000')
    expect(payload.unverified.rollover529At18.enabled).toBe(false)
  })

  it('bad tool input returns an in-band tool error, not a crash', async () => {
    const { body } = await rpc('tools/call', {
      name: 'project_530a',
      arguments: { asOf: 'nope' },
    })
    const result = (body as { result: { isError?: boolean; content: { text: string }[] } }).result
    expect(result.isError).toBe(true)
  })

  it('handles protocol plumbing: notifications, unknown methods, parse errors', async () => {
    expect((await rpc('notifications/initialized', {}, null)).status).toBe(202)
    const unknown = await rpc('bogus/method')
    expect((unknown.body as { error: { code: number } }).error.code).toBe(-32601)
    const res = await handler.fetch(
      new Request('https://mcp.example/', { method: 'POST', body: '{not json' }),
    )
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32700)
  })
})

describe('protocol + agent-platform surface', () => {
  it('negotiates a supported protocol version and keeps ours otherwise', async () => {
    const older = await rpc('initialize', { protocolVersion: '2025-03-26' })
    expect((older.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      '2025-03-26',
    )
    const unknown = await rpc('initialize', { protocolVersion: '1999-01-01' })
    expect((unknown.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      '2025-06-18',
    )
  })

  it('declares read-only annotations and output schemas on every tool', async () => {
    const { body } = await rpc('tools/list', {})
    const tools = (
      body as {
        result: {
          tools: { annotations?: { readOnlyHint?: boolean }; outputSchema?: object }[]
        }
      }
    ).result.tools
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.outputSchema).toBeTruthy()
    }
  })

  it('returns structuredContent alongside text content', async () => {
    const { body } = await rpc('tools/call', { name: 'explain_530a', arguments: {} })
    const result = (
      body as { result: { structuredContent?: { sourceUrl?: string }; content: unknown[] } }
    ).result
    expect(result.structuredContent?.sourceUrl).toBe('https://530amodel.com')
    expect(result.content).toHaveLength(1)
  })

  it('search returns the OpenAI connector shape and fetch round-trips an id', async () => {
    const search = await rpc('tools/call', {
      name: 'search',
      arguments: { query: 'employer contribution cap' },
    })
    const { results } = (
      search.body as {
        result: { structuredContent: { results: { id: string; title: string; url: string }[] } }
      }
    ).result.structuredContent
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toMatch(/^https:\/\/530amodel\.com\//)
    }

    const fetched = await rpc('tools/call', { name: 'fetch', arguments: { id: results[0]?.id } })
    const doc = (
      fetched.body as {
        result: { structuredContent: { id: string; title: string; text: string; url: string } }
      }
    ).result.structuredContent
    expect(doc.id).toBe(results[0]?.id)
    expect(doc.text.length).toBeGreaterThan(40)
  })

  it('fetch with an unknown id is a tool error, not a crash', async () => {
    const { body } = await rpc('tools/call', { name: 'fetch', arguments: { id: 'nope' } })
    expect((body as { result: { isError?: boolean } }).result.isError).toBe(true)
  })

  it('exposes MCP headers to browser clients', async () => {
    const res = await handler.fetch(new Request('https://mcp.example/', { method: 'OPTIONS' }))
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Mcp-Session-Id')
  })
})
