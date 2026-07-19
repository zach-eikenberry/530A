# 530A Model

**[530amodel.com](https://530amodel.com)** — a free, privacy-first, mobile-first scenario-planning
calculator for 530A custodial retirement accounts ("Trump Accounts").

No login. No email capture. No monetization. All calculation runs in your browser.

## Use the public API / MCP server

The engine is free to call — no key, nothing stored, attribution to 530amodel.com asked:

- **JSON API** — `https://api.530amodel.com` (`POST /v1/project`, `GET /v1/rules`,
  `GET /v1/returns`; [OpenAPI 3.1](https://api.530amodel.com/openapi.json) with full
  request/response schemas)
- **MCP server** — `https://mcp.530amodel.com` (streamable HTTP; tools `project_530a`,
  `explain_530a`, `search`, `fetch`; registry name `com.530amodel/calculator`). Works as a
  custom connector in Claude and ChatGPT, and with the Anthropic/OpenAI agent APIs.
- **Docs & platform quickstarts** — [530amodel.com/api](https://530amodel.com/api) ·
  machine-readable maps: [llms.txt](https://530amodel.com/llms.txt),
  [llms-full.txt](https://530amodel.com/llms-full.txt)
- **Contact** — api@530amodel.com

## Structure

```
packages/
  engine/     # pure TS calculation engine — zero deps, deterministic, integer-cents money
  config/     # legal figures + sources + verifiedAt + feature flags (single source of truth)
  ui/         # design tokens, shared components, charts
apps/
  web/        # Astro static site (widget, advanced model, content pages)
  workers/    # Cloudflare Workers: analytics beacon, rollup cron, newsfeed cron, email
  api/        # public calculator API (wraps the engine; OpenAPI; cache-by-input-hash)
  mcp/        # read-only MCP server (project_530a / explain_530a)
reference/    # Python reference implementation + golden-vector generator
e2e/          # Playwright specs (user journeys UC-1..UC-7)
```

## Non-negotiables

1. Financial math is exact, deterministic, and independently tested (golden vectors from the
   Python reference implementation must match the TS engine **to the cent**).
2. Static-first: calculation is client-side; a million users cost the same as one.
3. Minimal dependencies, no PII, small attack surface, everything scanned in CI.
4. Every user-facing claim is honest: ranges are labeled estimates, legal figures cite sources,
   unverified items live behind OFF feature flags (`packages/config/src/flags.ts`).

## Development

```sh
pnpm install
pnpm check     # lint + typecheck + test + build (same as CI)
pnpm --filter @530a/web dev
```

Node ≥ 22, pnpm ≥ 11. Engine numeric contract: money is integer cents (`bigint`), balances are
quantized round-half-to-even every monthly step, display formatting only via `formatMoney`.

## Disclaimer

This tool provides educational estimates only, not financial, tax, or legal advice. Market
projections are probabilistic and not guarantees.
