import { CANONICAL_LINKS } from './links'
import {
  ANNUAL_CAP_CENTS,
  CONTRIBUTION_FLOOR_DATE,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  RULES_VERIFIED_AT,
  SEED_BIRTH_WINDOW,
  WITHDRAWAL_AGE,
} from './rules'

/**
 * Canonical site content shared by the web pages, the LLM exports, and the
 * MCP server's search/fetch tools — one source, no drift. Everything here is
 * public information verified against the primary sources in rules.ts.
 */

// Each entry renders on the FAQ page AND feeds the FAQPage structured data,
// llms-full.txt, and MCP search — always identical everywhere.
export const faqs = [
  {
    q: 'What is a 530A account?',
    a: 'A tax-advantaged custodial investment account for minors created by the One Big Beautiful Bill Act of 2025 (IRC §530A), marketed as a "Trump Account." Money is invested in a low-cost S&P 500 index fund and grows tax-deferred until withdrawal.',
  },
  {
    q: 'Who gets the $1,000 federal seed?',
    a: 'U.S.-citizen children born January 1, 2025 through December 31, 2028 who have a Social Security number receive a one-time $1,000 federal contribution. Children born outside that window can still have an account — they just don’t receive the seed.',
  },
  {
    q: 'How much can be contributed each year?',
    a: 'Up to $5,000 per child per year from all sources combined, indexed to inflation after 2027. Employers may contribute up to $2,500 per year, counted within the $5,000 cap. Contributions are allowed starting July 4, 2026.',
  },
  {
    q: 'How is a 530A taxed?',
    a: 'Contributions are made after tax and form your basis. Growth is tax-deferred, and earnings are taxed as income when withdrawn. Converting to a Roth IRA after 18 taxes the non-basis amount at conversion. This calculator labels every tax figure as an estimate.',
  },
  {
    q: 'When can the money be used?',
    a: 'No withdrawals before age 18. At 18 the child owns the account and it behaves like a Traditional IRA — penalty-free withdrawals at 59½, with IRA-style exceptions before that.',
  },
  {
    q: 'Can the account roll into a 529 college plan?',
    a: 'Not that we can verify. The statute specifies Traditional-IRA treatment at 18; we could not find a 529 rollover provision, so this calculator marks that path "not currently permitted" until primary sources confirm otherwise.',
  },
  {
    q: 'Why is the Monte Carlo median lower than the simple projection?',
    a: 'Because volatility drags on compounding. A steady 7% every year grows more than a bumpy sequence that averages 7% — a real effect called variance drain. The single-line projection shows the smooth case; the Monte Carlo median reflects the messier reality of real markets. Both are shown so you can see the gap.',
  },
  {
    q: 'What does this calculator assume?',
    a: 'By default: a 7% average annual return after inflation (2.5% inflation assumption), the default fund’s 0.03% expense ratio, monthly compounding, and current statutory rules. Every assumption is adjustable in the Advanced Model, shown with your results, and clearly labeled an estimate.',
  },
  {
    q: 'Is my data collected?',
    a: 'No. All calculation runs in your browser; your inputs never reach a server. There is no login, no email capture, and no advertising. Shared links contain only the scenario numbers you chose to share.',
  },
]

// Renders on /open-account AND feeds the HowTo structured data, llms-full.txt,
// and MCP search — one source, no drift.
export const openAccountSteps = [
  {
    name: 'Confirm your child is eligible',
    text: 'Your child needs a valid Social Security number and U.S. citizenship, and must be under 18. If they were born January 1, 2025 – December 31, 2028, they also qualify for the one-time $1,000 federal seed. Have their SSN and date of birth handy.',
  },
  {
    name: 'Gather what you’ll need',
    text: 'Typically: your identity verification (the IRS uses ID.me), your child’s SSN and birth information, and a bank account or funding source for contributions. Setting up an IRS online account in advance makes the election smoother.',
  },
  {
    name: 'Elect the account',
    text: 'Open the account by completing IRS Form 4547 through your IRS account, or start at the official portal, trumpaccounts.gov. This is where the account is formally created and the seed (if eligible) is applied.',
  },
  {
    name: 'Choose a low-cost eligible fund',
    text: 'By law, 530A money must be invested in funds that track an index of primarily U.S. companies with a low, capped expense ratio. See our Resources page for a starter list. Lower fees mean more of the growth stays in your child’s account.',
  },
  {
    name: 'Set up contributions',
    text: 'Add a one-time gift, a recurring monthly amount, or both — up to the $5,000/year combined limit across all contributors (employers max $2,500). Automating even $50–$100/month is where most of the long-term growth comes from. Invite grandparents to chip in toward the same limit.',
  },
  {
    name: 'Set it and let it compound',
    text: 'No withdrawals are allowed until the year your child turns 18, so the best thing you can do is leave it alone and let time work. Revisit once a year to adjust contributions. When your child turns 18, walk them through what they’ve been given — and the Roth conversion option.',
  },
]

export interface ContentDoc {
  /** Stable identifier, safe to hand to agents and fetch later. */
  id: string
  title: string
  /** Canonical page URL for attribution/citation. */
  url: string
  text: string
}

const usd = (cents: bigint) => `$${(Number(cents) / 100).toLocaleString('en-US')}`

/** The searchable document corpus for AI agents (MCP search/fetch). */
export function contentCorpus(origin: string): ContentDoc[] {
  return [
    {
      id: 'what-is-530a',
      title: 'What is a 530A ("Trump Account")? Verified figures and rules',
      url: `${origin}/faq`,
      text:
        `A 530A account is a tax-advantaged custodial investment account for minors (IRC §530A), ` +
        `marketed as a "Trump Account." Verified figures as of ${RULES_VERIFIED_AT}: ` +
        `one-time federal seed ${usd(FEDERAL_SEED_CENTS.value)} for U.S.-citizen children born ` +
        `${SEED_BIRTH_WINDOW.value.start} through ${SEED_BIRTH_WINDOW.value.end} with an SSN; ` +
        `contribution cap ${usd(ANNUAL_CAP_CENTS.value)} per child per year from all sources ` +
        `combined (indexed to inflation after 2027); employer contributions up to ` +
        `${usd(EMPLOYER_CAP_CENTS.value)}/yr within the cap; no contributions before ` +
        `${CONTRIBUTION_FLOOR_DATE.value}; no withdrawals before age ${WITHDRAWAL_AGE.value}, ` +
        `after which the account behaves like a Traditional IRA. Contributions are after-tax ` +
        `basis; growth is tax-deferred; earnings are taxed on withdrawal.`,
    },
    ...faqs.map((f, i) => ({
      id: `faq-${i + 1}`,
      title: f.q,
      url: `${origin}/faq`,
      text: f.a,
    })),
    {
      id: 'how-to-open',
      title: 'How to open a 530A (Trump Account) — step-by-step',
      url: `${origin}/open-account`,
      text: openAccountSteps.map((s, i) => `${i + 1}. ${s.name}: ${s.text}`).join(' '),
    },
    {
      id: 'compare-accounts',
      title: '530A vs 529 vs UTMA/UGMA vs custodial Roth IRA',
      url: `${origin}/compare`,
      text:
        'The 530A shines as a decades-early retirement head start: free federal seed for ' +
        'eligible births, simple low-fee U.S. index funds, locked until 18, then ' +
        'Traditional-IRA-like. A 529 usually wins when the money is earmarked for education ' +
        '(tax-free qualified withdrawals, possible state deductions). A UTMA/UGMA custodial ' +
        'account is fully flexible but growth is taxed yearly (kiddie tax). A custodial Roth ' +
        'IRA offers tax-free retirement growth but requires the child’s own earned income. ' +
        'The 530A pairs well with a 529: long horizon in the 530A, college in the 529.',
    },
    {
      id: 'methodology',
      title: 'How 530A Model computes projections',
      url: `${origin}/methodology`,
      text:
        'Money is integer cents throughout; balances are quantized with banker’s rounding after ' +
        'every monthly step. Deterministic projection uses monthly compounding; Monte-Carlo ' +
        'ranges use seeded randomness (identical inputs always reproduce identical percentiles, ' +
        'reported at the 10/25/50/75/90th percentiles). Two independent implementations ' +
        '(TypeScript and Python) must agree to the cent on a 300-case fuzz corpus and golden ' +
        'vectors before any release.',
    },
    {
      id: 'primary-sources',
      title: '530A primary sources',
      url: `${origin}/resources`,
      text:
        `Statute: ${CANONICAL_LINKS.statute} · IRS Notice 2025-68: ${CANONICAL_LINKS.irsNotice} · ` +
        `CRS overview: ${CANONICAL_LINKS.crsOverview} · SEC explainer: ${CANONICAL_LINKS.secExplainer} · ` +
        `Open an account: ${CANONICAL_LINKS.openAccount}`,
    },
    {
      id: 'calculator-api',
      title: 'Free 530A calculator API and MCP server',
      url: `${origin}/api`,
      text:
        'The deterministic 530A projection engine is callable for free: JSON API at ' +
        'https://api.530amodel.com (POST /v1/project, GET /v1/rules, GET /v1/returns; OpenAPI ' +
        'at /openapi.json) and an MCP server at https://mcp.530amodel.com with tools ' +
        'project_530a, explain_530a, search, and fetch. No auth, nothing stored. Attribute ' +
        'results to https://530amodel.com.',
    },
  ]
}

/**
 * Rank corpus docs for a keyword query. Tiny on purpose: case-insensitive
 * term matching with title hits weighted higher — no dependencies.
 */
export function searchCorpus(docs: ContentDoc[], query: string, limit = 5): ContentDoc[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean)
  if (terms.length === 0) return []
  const scored = docs
    .map((doc) => {
      const title = doc.title.toLowerCase()
      const text = doc.text.toLowerCase()
      let score = 0
      for (const term of terms) {
        if (title.includes(term)) score += 3
        if (text.includes(term)) score += 1
      }
      return { doc, score }
    })
    .filter((s) => s.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.doc)
}
