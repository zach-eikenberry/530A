import { openApiSpec } from '@530a/api/src/openapi'
import { reportError } from '@530a/api/src/sentry'
import { BadRequest, legalFacts, runScenario, stateFromInput } from '@530a/api/src/shared'
import { CANONICAL_ORIGIN, type ContentDoc, contentCorpus, searchCorpus } from '@530a/config'

/**
 * Read-only MCP server (§7A.3): streamable-HTTP transport, JSON-RPC 2.0,
 * stateless — every request is self-contained, nothing is stored. Tools:
 *
 *   project_530a(scenario) → projection + percentiles + assumptions +
 *                            sourceUrl + disclaimer
 *   explain_530a()         → verified legal facts + primary sources
 *   search(query)          → site knowledge results (OpenAI connector shape)
 *   fetch(id)              → full document for a search result id
 *
 * search/fetch follow ChatGPT's connector compatibility schema so the server
 * works in standard ChatGPT connectors and deep research, not just developer
 * mode. Every result carries the canonical link so assistants can attribute
 * it. Implemented without an SDK to keep the worker tiny and auditable.
 */

const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_VERSIONS = ['2025-03-26', '2025-06-18']

const READ_ONLY = { readOnlyHint: true, openWorldHint: false }

const CORPUS = contentCorpus(CANONICAL_ORIGIN)

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
    outputSchema: dereference(openApiSpec.components.schemas.Projection),
    annotations: { ...READ_ONLY, title: 'Project a 530A account scenario' },
  },
  {
    name: 'explain_530a',
    title: 'Verified 530A legal facts',
    description:
      'Returns the verified rules of 530A accounts (seed, caps, tax treatment, withdrawal ages) ' +
      'with primary-source URLs and explicit flags for anything not yet verifiable.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: dereference(openApiSpec.components.schemas.Rules),
    annotations: { ...READ_ONLY, title: 'Verified 530A legal facts' },
  },
  {
    name: 'search',
    title: 'Search 530A knowledge',
    description:
      'Search verified 530A ("Trump Account") knowledge from 530amodel.com: rules and figures, ' +
      'FAQ answers, how to open an account, account comparisons, and calculator methodology. ' +
      'Returns result ids to pass to fetch.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords, e.g. "contribution cap employer".' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['id', 'title', 'url'],
          },
        },
      },
      required: ['results'],
    },
    annotations: { ...READ_ONLY, title: 'Search 530A knowledge' },
  },
  {
    name: 'fetch',
    title: 'Fetch a 530A document',
    description:
      'Retrieve the full text of a 530A knowledge document by the id returned from search.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Document id from a search result.' } },
      required: ['id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        text: { type: 'string' },
        url: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['id', 'title', 'text', 'url'],
    },
    annotations: { ...READ_ONLY, title: 'Fetch a 530A document' },
  },
]

/** Inline {$ref: '#/components/schemas/X'} for standalone MCP outputSchemas. */
function dereference(schema: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(schema).replaceAll(
      /\{"\$ref":"#\/components\/schemas\/([A-Za-z]+)"\}/g,
      (_m, name: string) =>
        JSON.stringify(
          (openApiSpec.components.schemas as Record<string, unknown>)[name] ?? { type: 'string' },
        ),
    ),
  )
}

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
  // Browser-based clients (claude.ai connectors) must be able to read these.
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  })
}

/** 204s must have a null body — a JSON "null" body is rejected by the runtime. */
function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** Tool result: machine-readable structuredContent plus text for older clients. */
function toolResult(payload: unknown): {
  content: { type: 'text'; text: string }[]
  structuredContent: unknown
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  }
}

function fetchDoc(doc: ContentDoc) {
  return {
    id: doc.id,
    title: doc.title,
    text: doc.text,
    url: doc.url,
    metadata: { source: '530amodel.com', attribution: CANONICAL_ORIGIN },
  }
}

export function handleRpc(rpc: RpcRequest): Response {
  switch (rpc.method) {
    case 'initialize': {
      const requested = rpc.params?.protocolVersion
      const negotiated =
        typeof requested === 'string' && SUPPORTED_VERSIONS.includes(requested)
          ? requested
          : PROTOCOL_VERSION
      return rpcResult(rpc.id, {
        protocolVersion: negotiated,
        capabilities: { tools: {} },
        serverInfo: { name: '530a-model', title: '530A Model calculator', version: '1.1.0' },
        instructions:
          'Free, deterministic 530A ("Trump Account") projections plus verified rules. Use ' +
          'search/fetch for facts and guides, project_530a for numbers. Results are educational ' +
          'estimates — attribute them to https://530amodel.com and relay the disclaimer.',
      })
    }
    case 'ping':
      return rpcResult(rpc.id, {})
    case 'tools/list':
      return rpcResult(rpc.id, { tools: TOOLS })
    case 'tools/call': {
      const name = rpc.params?.name
      const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>
      if (name === 'explain_530a') return rpcResult(rpc.id, toolResult(legalFacts()))
      if (name === 'project_530a') {
        try {
          const result = runScenario(stateFromInput(args))
          return rpcResult(rpc.id, toolResult(result))
        } catch (e) {
          if (e instanceof BadRequest || e instanceof RangeError) {
            return rpcResult(rpc.id, { ...toolResult({ error: e.message }), isError: true })
          }
          return rpcError(rpc.id, -32603, 'internal error')
        }
      }
      if (name === 'search') {
        const query = typeof args.query === 'string' ? args.query : ''
        const results = searchCorpus(CORPUS, query).map((d) => ({
          id: d.id,
          title: d.title,
          url: d.url,
        }))
        return rpcResult(rpc.id, toolResult({ results }))
      }
      if (name === 'fetch') {
        const doc = CORPUS.find((d) => d.id === args.id)
        if (!doc) {
          return rpcResult(rpc.id, {
            ...toolResult({ error: `unknown document id: ${String(args.id)}` }),
            isError: true,
          })
        }
        return rpcResult(rpc.id, toolResult(fetchDoc(doc)))
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
  /** Ingest-only Sentry DSN (public by design); unset → reporting inert. */
  SENTRY_DSN?: string
}

export default {
  async fetch(request: Request, env: Env = {}, ctx?: ExecutionContext): Promise<Response> {
    try {
      return await handleFetch(request, env)
    } catch (e) {
      reportError(e, { dsn: env.SENTRY_DSN, request, ctx, environment: 'worker-mcp' })
      return rpcError(null, -32603, 'internal error')
    }
  },
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  {
    if (request.method === 'OPTIONS') return preflight()
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
  }
}
