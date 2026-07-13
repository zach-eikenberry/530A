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
| R2 bucket | `530a-assets` | **not created yet** | Static shared assets (fonts/logo). Blocked: R2 must be enabled once in the dashboard (needs payment method on file). Needed by Phase 4. |
| Analytics Engine | — | — | Created implicitly via Worker binding in Phase 3 |
| Turnstile | — | — | Widget created in dashboard when email-to-self ships (Phase 4) |

## CI deploys

`.github/workflows/ci.yml` deploys on green `main` once these exist:

- GitHub secret `CLOUDFLARE_API_TOKEN` — create in the Cloudflare dashboard
  (My Profile → API Tokens) scoped to this account with Pages:Edit; must
  belong to the personal account.
- GitHub secret `CLOUDFLARE_ACCOUNT_ID` — `fd89fcd385cb37ed871df05e3c7eb10b`.
- GitHub repo variable `DEPLOY_ENABLED=true`.

## Owner checklist (dashboard-only, one-time)

- [ ] Billing alert / notification so spend can never surprise (~$5/mo expected, ≤$20 ceiling)
- [ ] Enable R2 (adds payment method; free tier covers our usage)
- [ ] Create the CI API token above
- [ ] Point `530amodel.com` at the Pages project when ready to go live (Phase 2)
