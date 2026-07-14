# Cloudflare infrastructure (personal account)

All resources live in the owner's **personal** Cloudflare account
(`fd89fcd385cb37ed871df05e3c7eb10b`, Personal Account). Verify with
`wrangler whoami` before touching anything. Account IDs are not secrets;
API tokens are and live only in Cloudflare/GitHub encrypted secrets.

| Resource | Name / binding | ID | Purpose |
|---|---|---|---|
| Pages project | `530a-model` | — | Static site (production branch `main`) → https://530a-model.pages.dev |
| D1 database | `530a` | `ccf5319c-1f61-4520-8095-cac064a89fe7` | Newsfeed entries + daily aggregate rollups only (low-write) |
| KV namespace | `CACHE` | `ef25dd28844040218fc0dd229c5c2c2c` | Edge cache for stats/newsfeed JSON |
| R2 bucket | `530a-assets` | — | Static shared assets (fonts/logo), used from Phase 4 |
| Worker | `530a-events` | — | Anonymized event beacon → Analytics Engine dataset `site_events` (deploy: `pnpm --filter @530a/workers deploy:events`) |
| Worker | `530a-api` | — | Public calculator API (§7A.2), cache-by-input-hash (deploy: `pnpm --filter @530a/api deploy`) |
| Worker | `530a-mcp` | — | Read-only MCP server: project_530a / explain_530a (deploy: `pnpm --filter @530a/mcp deploy`) |
| Worker | `530a-newsfeed` | — | Newsfeed ingest cron (every 6h) + /feed.json + admin queue (deploy: `wrangler deploy --config wrangler.newsfeed.jsonc` in apps/workers). Secrets: ADMIN_TOKEN (see `.admin-token.local`, uncommitted), DEPLOY_HOOK_URL. Add RSS feeds via FEED_URLS in wrangler.newsfeed.jsonc |
| Pages deploy hook | `newsfeed-change` | `b253e850…` | Pinged by the ingest cron after changes so /pledges regenerates |
| Analytics Engine | `site_events` | — | High-volume event store; daily rollup cron reads it in Phase 6 |
| Turnstile | — | — | Widget created in dashboard when email-to-self ships (Phase 4) |

## CI deploys

`.github/workflows/ci.yml` deploys on green `main` once these exist:

- GitHub secret `CLOUDFLARE_API_TOKEN` — create in the Cloudflare dashboard
  (My Profile → API Tokens) scoped to this account with Pages:Edit; must
  belong to the personal account.
- GitHub secret `CLOUDFLARE_ACCOUNT_ID` — `fd89fcd385cb37ed871df05e3c7eb10b`.
- GitHub repo variable `DEPLOY_ENABLED=true`.

## Owner checklist (dashboard-only, one-time)

- [x] Billing alert / notification so spend can never surprise (~$5/mo expected, ≤$20 ceiling)
- [x] Enable R2 (free tier covers our usage)
- [x] Create the CI API token (needs Pages:Edit + Account Settings:Read)
- [x] Point `530amodel.com` at the Pages project (live)
- [ ] Create a Google Alerts RSS feed for 530A/Trump Account news and add its URL to FEED_URLS in apps/workers/wrangler.newsfeed.jsonc
- [ ] Admin queue: token in `.admin-token.local` (repo root, never committed) — use it at 530amodel.com/admin
