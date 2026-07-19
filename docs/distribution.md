# Distribution kit — getting the 530A API/MCP in front of AI platforms

Everything here is prepared; items marked **(owner)** need Zach's accounts to submit.

## Already live (no action)

- Official MCP registry: `com.530amodel/calculator` → `https://mcp.530amodel.com`
  (published via `mcp-publisher`; domain proven by
  `https://530amodel.com/.well-known/mcp-registry-auth`; private key in
  `.mcp-registry-key.local`, uncommitted — needed for future version bumps:
  `mcp-publisher login http --domain 530amodel.com --private-key $(cat .mcp-registry-key.local)`
  then `mcp-publisher publish`).
- Discovery surfaces: `/.well-known/mcp.json`, `/.well-known/api-catalog`, `llms.txt`,
  `llms-full.txt`, OpenAPI with response schemas, `/api` docs with per-platform quickstarts.
- ChatGPT compatibility: the MCP server implements the `search`/`fetch` connector schema, so
  it works in standard connectors and deep research, not just developer mode.

## Claude connector directory (owner)

Submit at the Anthropic MCP directory form (claude.ai → Connectors → "Submit a connector",
or the directory submission form linked from support.claude.com's "MCP connectors" article).

- **Name:** 530A Model calculator
- **Server URL:** `https://mcp.530amodel.com` — no auth
- **Short description:** Free, deterministic 530A ("Trump Account") projections with
  Monte-Carlo ranges, verified legal facts with primary sources, and searchable guides.
  Read-only; nothing stored; no login.
- **Categories:** Finance / Productivity
- **Privacy policy:** https://530amodel.com/privacy · **Terms:** https://530amodel.com/terms
- **Contact:** api@530amodel.com
- **Screenshots (required: 3–5 PNGs, ≥1000px wide, cropped to the response, each with its
  prompt):** capture in claude.ai with the connector added. Suggested prompt pairs:
  1. "Model $100/month for a newborn 530A — what's it worth at 18 and 65?" (projection reply)
  2. "What are the 530A contribution caps and tax rules? Cite primary sources." (explain reply)
  3. "Compare $50/mo vs $250/mo in a 530A for a child born 2026." (comparison reply)
  4. "How do I open a Trump Account?" (search/fetch reply)

## ChatGPT / OpenAI (owner)

- **Connector (any Plus/Pro/Team user):** Settings → Connectors → Add custom connector →
  `https://mcp.530amodel.com`. Works for chat tools and deep research (search/fetch).
- **Custom GPT with Actions:** GPT builder → Actions → Import from URL →
  `https://api.530amodel.com/openapi.json`; privacy policy URL
  `https://530amodel.com/privacy`. Name suggestion: "530A / Trump Account Calculator".
- **Apps SDK (future):** an interactive widget app is possible later; requires building an
  Apps SDK component and OpenAI review. Not prepared here.

## Community directories (owner; ~5 min each)

Each listing is discovery + a citation. Point them all at `https://mcp.530amodel.com` and
the GitHub repo:

- Smithery — https://smithery.ai (add server)
- Glama — https://glama.ai/mcp/servers (submit)
- PulseMCP — https://www.pulsemcp.com (submit)
- mcp.so — https://mcp.so (submit)

## Keeping listings healthy

- Bump `version` in `server.json` and `serverInfo` in `apps/mcp/src/mcp.ts` together, then
  re-publish to the registry after tool changes.
- The registry and directories crawl the live server — keep `tools/list` accurate and the
  worker deployed before publishing version bumps.
- `RULES_VERIFIED_AT` drives freshness signals everywhere; re-verify rules on regulation
  changes (March 2026 regs expected) and bump it.
