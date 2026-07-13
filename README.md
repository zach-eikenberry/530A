# 530A Model

**[530amodel.com](https://530amodel.com)** — a free, privacy-first, mobile-first scenario-planning
calculator for 530A custodial retirement accounts ("Trump Accounts").

No login. No email capture. No monetization. All calculation runs in your browser.

## ⚠️ Deployment account warning

This project deploys **exclusively to the owner's personal Cloudflare account**. Never deploy to,
or create resources in, any other Cloudflare account. Verify with `wrangler whoami` before any
deploy. Budget: ~$5/mo expected, ≤$20/mo ceiling.

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
pnpm ci        # lint + typecheck + test + build (same as CI)
pnpm --filter @530a/web dev
```

Node ≥ 22, pnpm ≥ 11. Engine numeric contract: money is integer cents (`bigint`), balances are
quantized round-half-to-even every monthly step, display formatting only via `formatMoney`.

## Disclaimer

This tool provides educational estimates only, not financial, tax, or legal advice. Market
projections are probabilistic and not guarantees.
