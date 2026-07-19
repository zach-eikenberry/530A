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

## 1. Long-tail content pages — SHIPPED July 19, 2026

`/glossary`, `/withdrawals`, `/contribution-deadline`, `/employer-contributions`,
`/530a-vs-529`, and `/updates` are live with structured data and corpus entries.
Still open: **per-age landings** (`/calculator/newborn`, …) — only if the above prove
out; thin-content risk if done mechanically.

## 2. Freshness cadence

Answer engines strongly prefer recently-updated sources on evolving legislation.

- **Activate the newsfeed**: create the Google Alerts RSS feed for 530A/Trump Account news
  and set `FEED_URLS` in `apps/workers/wrangler.newsfeed.jsonc` (owner checklist item).
  That makes `/pledges` + `/pledges.xml` genuinely fresh.
- ~~Changelog page~~ — `/updates` shipped July 19, 2026; add a dated entry per
  re-verification (data in `apps/web/src/data/updates.ts`).
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
- ~~Worker-side error tracking~~ — shipped July 19, 2026 (toucan-js on all four workers).
- ~~Lighthouse mobile preset run~~ — shipped July 19, 2026.
