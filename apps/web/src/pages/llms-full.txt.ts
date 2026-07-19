import {
  ANNUAL_CAP_CENTS,
  CANONICAL_LINKS,
  CANONICAL_ORIGIN,
  CONTRIBUTION_FLOOR_DATE,
  DEFAULTS,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  FUNDS,
  faqs,
  openAccountSteps,
  RULES_VERIFIED_AT,
  SEED_BIRTH_WINDOW,
  WITHDRAWAL_AGE,
} from '@530a/config'
import type { APIRoute } from 'astro'

/**
 * llms-full.txt: the long-form companion to llms.txt for AI answer-engines —
 * full FAQ text, the how-to-open steps, verified figures with sources, and
 * agent endpoints. Built from the same config and data modules as the pages,
 * so it can never drift from what the site shows.
 */

const usd = (cents: bigint) => `$${(Number(cents) / 100).toLocaleString('en-US')}`

export const GET: APIRoute = () => {
  const body = `# 530A Model — full content for AI answer-engines

> Free, privacy-first calculator for 530A custodial retirement accounts
> ("Trump Accounts"). Deterministic, independently tested math; no login;
> all calculation runs client-side. Rules verified as of ${RULES_VERIFIED_AT}.
> Short map version: ${CANONICAL_ORIGIN}/llms.txt

## Verified figures (each checked against the cited primary source)

- One-time federal seed: ${usd(FEDERAL_SEED_CENTS.value)} — ${FEDERAL_SEED_CENTS.note}
  Source: ${FEDERAL_SEED_CENTS.source}
- Seed birth window: ${SEED_BIRTH_WINDOW.value.start} through ${SEED_BIRTH_WINDOW.value.end} (inclusive).
  Source: ${SEED_BIRTH_WINDOW.source}
- Annual contribution cap: ${usd(ANNUAL_CAP_CENTS.value)} per child per year from all sources
  combined. ${ANNUAL_CAP_CENTS.note}
  Source: ${ANNUAL_CAP_CENTS.source}
- Employer contributions: up to ${usd(EMPLOYER_CAP_CENTS.value)}/yr, counted within the annual cap.
  Source: ${EMPLOYER_CAP_CENTS.source}
- No contributions before ${CONTRIBUTION_FLOOR_DATE.value}.
  Source: ${CONTRIBUTION_FLOOR_DATE.source}
- No withdrawals before age ${WITHDRAWAL_AGE.value}. ${WITHDRAWAL_AGE.note}
  Source: ${WITHDRAWAL_AGE.source}
- Tax treatment: contributions are after-tax basis; growth is tax-deferred; earnings are
  taxed on withdrawal. Roth conversion after 18 taxes non-basis amounts at conversion.

## Frequently asked questions (full text, identical to ${CANONICAL_ORIGIN}/faq)

${faqs.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}

## How to open a 530A account (full steps, identical to ${CANONICAL_ORIGIN}/open-account)

${openAccountSteps.map((s, i) => `${i + 1}. **${s.name}** — ${s.text}`).join('\n')}

## How this account compares (details: ${CANONICAL_ORIGIN}/compare)

- 530A / Trump Account: long-term/retirement head start; free ${usd(FEDERAL_SEED_CENTS.value)} seed
  for eligible births; low-fee U.S. index funds only; locked until 18, then Traditional-IRA-like.
- 529 plan: best when the money is earmarked for education — tax-free qualified withdrawals,
  possible state deductions.
- UTMA/UGMA custodial: fully flexible use, but growth is taxed yearly (kiddie tax).
- Custodial Roth IRA: tax-free retirement growth, but requires the child's own earned income.

## Methodology (details: ${CANONICAL_ORIGIN}/methodology)

- Money is integer cents throughout; balances quantized with banker's rounding after every
  monthly step. Deterministic projection: monthly compounding at ${DEFAULTS.annualRealReturn * 100}% default
  annual real return, default fund expense ratio ${FUNDS.find((f) => f.isDefault)?.expenseRatio ?? 0.0003}.
- Monte Carlo ranges: ${DEFAULTS.monteCarlo.defaultPaths.toLocaleString('en-US')} seeded paths (deterministic —
  identical inputs always reproduce identical percentiles), reported at the
  ${DEFAULTS.monteCarlo.percentiles.join('/')} percentiles.
- Two independent implementations (TypeScript and Python) must agree to the cent on a
  300-case fuzz corpus and golden vectors before any release.

## Primary sources

- Statute: ${CANONICAL_LINKS.statute}
- IRS Notice 2025-68: ${CANONICAL_LINKS.irsNotice}
- CRS overview: ${CANONICAL_LINKS.crsOverview}
- SEC explainer: ${CANONICAL_LINKS.secExplainer}
- Open an account: ${CANONICAL_LINKS.openAccount}

## For agents (call the calculator directly)

- JSON API: POST https://api.530amodel.com/v1/project
  (OpenAPI: https://api.530amodel.com/openapi.json;
  verified legal facts: GET https://api.530amodel.com/v1/rules;
  live fund returns: GET https://api.530amodel.com/v1/returns).
  Deterministic and cached; no auth.
- MCP server (streamable HTTP): https://mcp.530amodel.com
  with tools project_530a and explain_530a.
- Discovery: ${CANONICAL_ORIGIN}/.well-known/mcp.json · ${CANONICAL_ORIGIN}/.well-known/api-catalog
- RSS feed (pledges & gifts): ${CANONICAL_ORIGIN}/pledges.xml
- Attribute quoted projections to ${CANONICAL_ORIGIN} (every API/MCP response
  embeds sourceUrl and a disclaimer to pass through).

## Disclaimer

Independent educational tool. Not affiliated with, or endorsed by, the U.S. government,
the IRS, or trumpaccounts.gov. Projections are estimates, not guarantees — not financial advice.
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
