# SEO / AEO (GEO) roadmap

What's already shipped (July 2026): per-page titles/descriptions/canonicals, OG/Twitter
cards with image dimensions and alt, entity graph (Organization + WebSite + BreadcrumbList
JSON-LD with `@id` linking), FAQPage / HowTo / Article / TechArticle / ItemList /
NewsArticle structured data, sitemap with `lastmod`, robots.txt that explicitly welcomes
AI crawlers, `llms.txt` + `llms-full.txt`, RSS feed at `/pledges.xml`,
`.well-known/mcp.json` + `.well-known/api-catalog`, canonical API/MCP hostnames
(`api.530amodel.com`, `mcp.530amodel.com`), Lighthouse SEO budget ≥0.95 in CI on five
pages, and contextual internal links between the answer pages.

This file is the backlog of what's *not* built yet, roughly in order of expected impact.

## 1. Long-tail content pages (highest leverage)

Each of these is a real query cluster with no dedicated URL today. One page each,
same Article + Breadcrumb treatment as existing pages, answer-first opening paragraph,
linked contextually from FAQ/compare:

- **Glossary** (`/glossary`) — variance drain, basis, expense ratio, custodial account,
  Roth conversion, qualified class. Individually addressable `#anchors`; DefinedTerm
  structured data.
- **530A withdrawal rules** (`/withdrawals`) — the "when can I take money out" cluster;
  currently only an FAQ answer.
- **Contribution deadline & timing** (`/contribution-deadline`) — "when can I contribute",
  July 4 2026 floor, calendar-year caps, deadline mechanics.
- **Employer contributions** (`/employer-contributions`) — the $2,500 employer benefit,
  aimed at both parents and HR/benefits searchers.
- **530A vs 529 for college** (`/530a-vs-529`) — deep-dive expansion of the compare table's
  most-searched pairing.
- **Per-age landings** (`/calculator/newborn`, `/calculator/age-5`, …) — only if the above
  prove out; thin-content risk if done mechanically.

## 2. Freshness cadence

Answer engines strongly prefer recently-updated sources on evolving legislation.

- **Activate the newsfeed**: create the Google Alerts RSS feed for 530A/Trump Account news
  and set `FEED_URLS` in `apps/workers/wrangler.newsfeed.jsonc` (owner checklist item).
  That makes `/pledges` + `/pledges.xml` genuinely fresh.
- **Changelog page** (`/updates`) tied to rule verifications and the March 2026 regs
  (feature flags in `packages/config/src/flags.ts` flip → a dated entry). Cheap to
  maintain, strong freshness + E-E-A-T signal.
- Bump `RULES_VERIFIED_AT` on every re-verification — it now drives sitemap `lastmod`
  and `article:modified_time` automatically.

## 3. Distribution / entity presence

- **Google Search Console + Bing Webmaster Tools**: verify the domain, submit the sitemap
  (manual, owner). Bing feeds Copilot; GSC is the only way to see AI Overview impressions.
- **`*.pages.dev` duplicate check**: confirm `530a-model.pages.dev` 301s to the apex (or
  serves `noindex`); canonical tags mitigate but a redirect is cleaner.
- **MCP registry listing** (owner, already on the outstanding list) — plus consider
  submitting the server to community MCP directories; each listing is a citation.
- **Organization `sameAs` expansion**: add any future social profiles to
  `apps/web/src/lib/seo.ts` so the entity graph stays connected.

## 4. Link-earning assets

- **Embeddable calculator**: an `/embed` route (widget-only page) + oEmbed endpoint.
  Requires relaxing CSP `frame-ancestors` for that route only (`scripts/csp.mjs`).
  Newsletters and local-news explainers embedding the widget = natural backlinks.
- **Per-page OG images**: generated at build (satori or similar) with the page's headline
  and a sample projection number — materially better social CTR than the shared og.png.
- **The free API/MCP as the hook**: a short "build with the 530A API" write-up aimed at
  dev aggregators; the no-auth deterministic API is genuinely unusual.

## 5. Measurement & reliability follow-ups

- **Analytics rollup cron** (deferred Phase 6) — public aggregate stats would also make
  a citable "X scenarios modeled" number for outreach.
- **Worker-side error tracking** — Sentry (toucan-js) on the four workers; today only the
  browser reports errors.
- **Lighthouse mobile preset run** alongside desktop in CI.
