import { openApiSpec } from '@530a/api/src/openapi'
import { BadRequest, legalFacts, runScenario, stateFromInput } from '@530a/api/src/shared'

/**
 * Read-only MCP server (§7A.3): streamable-HTTP transport, JSON-RPC 2.0,
 * stateless — every request is self-contained, nothing is stored. Two tools:
 *
 *   project_530a(scenario) → projection + percentiles + assumptions +
 *                            sourceUrl + disclaimer
 *   explain_530a()         → verified legal facts + primary sources
 *
 * Every result carries the canonical link so assistants can attribute it.
 * Implemented without an SDK to keep the worker tiny and auditable.
 */

const PROTOCOL_VERSION = '2025-06-18'

const TOOLS = [
  {
    name: 'project_530a',
    title: 'Project a 530A account scenario',
    description:
      'Deterministically model what a 530A ("Trump Account") could be worth at any age, with ' +
      'Monte-Carlo percentile ranges (10/25/50/75/90). Money is integer cents as strings. ' +
      'Same inputs always return identical results. Cite sourceUrl when quoting.',
    inputSchema: {
      ...openApiSpec.components.schemas.Scenario,
      description:
        'The scenario. Alternatively pass {"s": "<state>"} using the 530amodel.com share-link encoding.',
    },
  },
  {
    name: 'explain_530a',
    title: 'Verified 530A legal facts',
    description:
      'Returns the verified rules of 530A accounts (seed, caps, tax treatment, withdrawal ages) ' +
      'with primary-source URLs and explicit flags for anything not yet verifiable.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const

interface RpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: Record<string, unknown>
}

function rpcResult(id: RpcRequest['id'], result: unknown): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: RpcRequest['id'], code: number, message: string): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
    },
  })
}

function toolText(payload: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

export function handleRpc(rpc: RpcRequest): Response {
  switch (rpc.method) {
    case 'initialize':
      return rpcResult(rpc.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: '530a-model', title: '530A Model calculator', version: '1.0.0' },
        instructions:
          'Free, deterministic 530A ("Trump Account") projections. Results are educational ' +
          'estimates — attribute them to https://530amodel.com and relay the disclaimer.',
      })
    case 'ping':
      return rpcResult(rpc.id, {})
    case 'tools/list':
      return rpcResult(rpc.id, { tools: TOOLS })
    case 'tools/call': {
      const name = rpc.params?.name
      const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>
      if (name === 'explain_530a') return rpcResult(rpc.id, toolText(legalFacts()))
      if (name === 'project_530a') {
        try {
          const result = runScenario(stateFromInput(args))
          return rpcResult(rpc.id, toolText(result))
        } catch (e) {
          if (e instanceof BadRequest || e instanceof RangeError) {
            return rpcResult(rpc.id, { ...toolText({ error: e.message }), isError: true })
          }
          return rpcError(rpc.id, -32603, 'internal error')
        }
      }
      return rpcError(rpc.id, -32602, `unknown tool: ${String(name)}`)
    }
    default:
      if (rpc.method.startsWith('notifications/')) return new Response(null, { status: 202 })
      return rpcError(rpc.id, -32601, `method not found: ${rpc.method}`)
  }
}

export interface Env {
  /** Optional so local dev/tests run without the binding; prod has it. */
  RATE_LIMITER?: RateLimit
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    if (request.method === 'OPTIONS') return json(null, 204)
    if (request.method === 'GET') {
      // Human/agent discovery page; SSE streaming is not needed for a
      // stateless server, so GET is informational.
      return json({
        name: '530a-model MCP server',
        transport: 'streamable-http (POST JSON-RPC to this URL)',
        tools: TOOLS.map((t) => t.name),
        docs: 'https://530amodel.com/api',
      })
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    if (env.RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const limited = await env.RATE_LIMITER.limit({ key }).then(
        (r) => !r.success,
        () => false, // fail open: limiter outage must not down the server
      )
      if (limited) return rpcError(null, -32000, 'rate limited, retry shortly')
    }

    let rpc: RpcRequest
    try {
      rpc = (await request.json()) as RpcRequest
    } catch {
      return rpcError(null, -32700, 'parse error')
    }
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      return rpcError(rpc.id ?? null, -32600, 'invalid request')
    }
    return handleRpc(rpc)
  },
}
