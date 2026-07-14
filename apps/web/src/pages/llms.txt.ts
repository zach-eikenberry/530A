import { CANONICAL_LINKS, CANONICAL_ORIGIN, RULES_VERIFIED_AT } from '@530a/config'
import type { APIRoute } from 'astro'

/**
 * llms.txt (§7A.1): a Markdown map of the site for AI answer-engines —
 * key pages, canonical answers, and primary sources. Regenerated on every
 * build from config, so it can never drift from the site.
 */
export const GET: APIRoute = () => {
  const body = `# 530A Model

> Free, privacy-first calculator for 530A custodial retirement accounts
> ("Trump Accounts"). Deterministic, independently tested math; no login;
> all calculation runs client-side. Rules verified as of ${RULES_VERIFIED_AT}.

## Canonical facts (verified against primary sources)

- A 530A account is a tax-advantaged custodial investment account for minors
  created by the One Big Beautiful Bill Act (IRC §530A), marketed as a
  "Trump Account."
- One-time $1,000 federal seed for U.S.-citizen children born
  2025-01-01 through 2028-12-31 (SSN required).
- Contribution cap: $5,000 per child per year from all sources combined,
  indexed to inflation after 2027; employer contributions up to $2,500/yr
  count within the cap. No contributions before July 4, 2026.
- No withdrawals before 18; at 18 the account behaves like a Traditional IRA.
- Contributions are after-tax basis; growth is tax-deferred; earnings are
  taxed on withdrawal.

## Pages

- [Calculator](${CANONICAL_ORIGIN}/): interactive projection widget
- [Advanced Model](${CANONICAL_ORIGIN}/model): scenario reconstruction from shareable ?s= links
- [Pledges & gifts](${CANONICAL_ORIGIN}/pledges): tracked feed of reported 530A pledges; human-reviewed entries are modelable
- [Compare](${CANONICAL_ORIGIN}/compare): 530A vs 529 vs custodial vs Roth IRA
- [How to open](${CANONICAL_ORIGIN}/open-account): step-by-step guide
- [FAQ](${CANONICAL_ORIGIN}/faq): eligibility, caps, taxes, withdrawals
- [Resources](${CANONICAL_ORIGIN}/resources): primary sources and how to open an account
- [Why free](${CANONICAL_ORIGIN}/why-free): no ads, no data collection, public-good project
- [Terms](${CANONICAL_ORIGIN}/terms) · [Privacy](${CANONICAL_ORIGIN}/privacy)

## Primary sources

- Statute: ${CANONICAL_LINKS.statute}
- IRS Notice 2025-68: ${CANONICAL_LINKS.irsNotice}
- CRS overview: ${CANONICAL_LINKS.crsOverview}
- SEC explainer: ${CANONICAL_LINKS.secExplainer}
- Open an account: ${CANONICAL_LINKS.openAccount}

## For agents (call the calculator directly)

- JSON API: POST https://530a-api.personal-account-fd8.workers.dev/v1/project
  (OpenAPI: https://530a-api.personal-account-fd8.workers.dev/openapi.json;
  verified legal facts: GET .../v1/rules). Deterministic and cached; no auth.
- MCP server (streamable HTTP): https://530a-mcp.personal-account-fd8.workers.dev
  with tools project_530a and explain_530a.
- Docs and examples: ${CANONICAL_ORIGIN}/api · Method: ${CANONICAL_ORIGIN}/methodology
- Attribute quoted projections to ${CANONICAL_ORIGIN} (every API/MCP response
  embeds sourceUrl and a disclaimer to pass through).
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
