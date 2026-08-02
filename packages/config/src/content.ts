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

const usd = (cents: bigint) => `$${(Number(cents) / 100).toLocaleString('en-US')}`

export interface PageFaq {
  q: string
  a: string
  /**
   * Path whose FAQPage JSON-LD owns this Q&A. Entries shared across pages are
   * emitted as structured data only on their owning page, so search engines
   * never see the same question with competing answers. Unset = owned by the
   * page it renders on.
   */
  ownedBy?: string
}

// One canonical answer for questions that render on several pages.
const rolloverFaq: PageFaq = {
  q: 'Can the account roll into a 529 college plan?',
  a: 'Not that we can verify. The statute specifies Traditional-IRA treatment at 18; we could not find a 529 rollover provision, so this calculator marks that path "not currently permitted" until primary sources confirm otherwise.',
  ownedBy: '/faq',
}

// Each entry renders on the FAQ page AND feeds the FAQPage structured data,
// llms-full.txt, and MCP search — always identical everywhere.
export const faqs = [
  {
    q: 'What is a 530A account?',
    a: 'A tax-advantaged custodial investment account for minors created by the One Big Beautiful Bill Act of 2025 (IRC §530A), marketed as a "Trump Account." Money is invested in low-cost index funds tracking primarily U.S. companies and grows tax-deferred until withdrawal.',
  },
  {
    q: 'Who gets the $1,000 federal seed?',
    a: 'U.S.-citizen children born January 1, 2025 through December 31, 2028 who have a Social Security number receive a one-time $1,000 federal contribution. Children born outside that window can still have an account — they just don’t receive the seed.',
  },
  {
    q: 'How much can be contributed each year?',
    a: 'Up to $5,000 per child per year from all sources combined, expected to be indexed to inflation after 2027 (exact mechanics pending IRS guidance). Employers may contribute up to $2,500 per year, counted within the $5,000 cap. Contributions have been allowed since July 4, 2026.',
  },
  {
    q: 'How is a 530A taxed?',
    a: 'Contributions are made after tax and form your basis. Growth is tax-deferred, and earnings are taxed as income when withdrawn. Converting to a Roth IRA after 18 taxes the non-basis amount at conversion. This calculator labels every tax figure as an estimate.',
  },
  {
    q: 'When can the money be used?',
    a: 'No withdrawals before age 18. At 18 the child owns the account and it behaves like a Traditional IRA — penalty-free withdrawals at 59½, with IRA-style exceptions before that.',
  },
  rolloverFaq,
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

// Page-local FAQ sets for the answer pages. Rendered by each page AND used
// for its FAQPage JSON-LD (minus entries owned elsewhere — see PageFaq).
export const pageFaqs: Record<
  'withdrawals' | 'contribution-deadline' | 'employer-contributions' | '530a-vs-529',
  PageFaq[]
> = {
  withdrawals: [
    {
      q: 'Can I withdraw from a 530A before my child turns 18?',
      a: 'No. The statute permits no withdrawals before the year the child turns 18. There is no hardship, education, or emergency carve-out in the law as verified — the account is locked by design so compounding can work.',
    },
    {
      q: 'What happens at 18?',
      a: 'The child becomes the owner and the account behaves like a Traditional IRA. That means withdrawals are possible but earnings are taxed as ordinary income, and before age 59½ the IRA-style rules (with their usual exceptions) apply.',
    },
    {
      q: 'When are withdrawals penalty-free?',
      a: 'At 59½, following Traditional-IRA treatment. Before that, IRA-style exceptions exist; whether the standard 10% early-withdrawal penalty applies to 530A accounts specifically is still pending confirmation in guidance, so this site labels it an assumption rather than fact.',
    },
    {
      q: 'What part of a withdrawal is tax-free?',
      a: `Only the basis — the after-tax contributions your family made. The ${usd(FEDERAL_SEED_CENTS.value)} federal seed, any employer contributions, and all growth are taxed as ordinary income when withdrawn.`,
    },
    {
      q: 'Can the money move to a Roth IRA instead?',
      a: 'After 18, converting to a Roth IRA is an option: income tax is due on the non-basis amount at conversion, and growth afterward is tax-free. Converting in a low-income year (like college) can meaningfully improve the lifetime outcome — model both paths in the Advanced Model.',
    },
    rolloverFaq,
  ],
  'contribution-deadline': [
    {
      q: 'When can I start contributing to a 530A?',
      a: 'Now — contributions opened July 4, 2026. The statute permitted none before that date, even for accounts opened earlier; those accounts simply held the $1,000 federal seed (if eligible) until the window opened.',
    },
    {
      q: 'Is there an annual contribution deadline?',
      a: `The ${usd(ANNUAL_CAP_CENTS.value)} cap applies per calendar year, per child, from all sources combined. Unused room does not roll over — a year you skip is capacity gone for good, which is the real deadline that matters.`,
    },
    {
      q: 'How much can be contributed in 2026?',
      a: `The ${usd(ANNUAL_CAP_CENTS.value)} cap applies to calendar-year 2026 even though contributions only opened July 4 — meaning the full year’s cap is available in the months that remain. As always: verify with the primary sources before acting.`,
    },
    {
      q: 'Does the cap grow over time?',
      a: `It is expected to be indexed to inflation after 2027, with the exact indexing mechanics pending guidance — so this calculator models the ${usd(ANNUAL_CAP_CENTS.value)} figure and flags indexing as approximate.`,
    },
    {
      q: 'Is it better to contribute monthly or once a year?',
      a: 'Earlier money compounds longer, so a January lump beats a December lump, and monthly automation beats waiting. But the difference between contribution timings is small compared to the difference between contributing and not — automate an amount you can sustain.',
    },
    {
      q: 'Until what age can contributions be made?',
      a: 'Contributions can be made until the year the child turns 18. After that the account transitions to Traditional-IRA treatment and the 530A contribution window closes.',
    },
  ],
  'employer-contributions': [
    {
      q: 'How much can an employer contribute to a 530A?',
      a: `Up to ${usd(EMPLOYER_CAP_CENTS.value)} per child per year. Employer money counts within the overall ${usd(ANNUAL_CAP_CENTS.value)} annual cap, so a full employer contribution leaves ${usd(ANNUAL_CAP_CENTS.value - EMPLOYER_CAP_CENTS.value)} of family capacity in that year.`,
    },
    {
      q: 'Is an employer 530A contribution taxable to me?',
      a: 'Employer contributions do not form part of your basis — like the federal seed, they and their growth are taxed as income when eventually withdrawn. The near-term benefit is real: it is money compounding for your child that didn’t come out of your paycheck.',
    },
    {
      q: 'What should I ask my employer or HR team?',
      a: `Whether a 530A / Trump Account contribution benefit is offered or planned, whether it covers all dependents born in the seed window and beyond, and how it coordinates with the ${usd(ANNUAL_CAP_CENTS.value)} cap so the family doesn’t accidentally over-contribute across sources.`,
    },
    {
      q: 'Why would an employer offer this?',
      a: `It is a family-friendly benefit with a hard per-child cost ceiling (${usd(EMPLOYER_CAP_CENTS.value)}/yr), simple mechanics compared to many benefits, and visible long-horizon impact — ${usd(EMPLOYER_CAP_CENTS.value)}/yr from birth to 18 can compound into a six-figure head start by retirement age.`,
    },
    {
      q: 'What happens if employer plus family contributions exceed $5,000?',
      a: 'The cap applies across all sources combined. This calculator clips contributions at the cap in source order and reports what was clipped rather than silently counting it — coordinate amounts so real-world contributions stay inside the limit.',
    },
  ],
  '530a-vs-529': [
    {
      q: 'Should college money go into a 530A or a 529?',
      a: 'If the money is earmarked for college, a 529 usually wins: withdrawals for qualified education costs are 100% tax-free, many states add a tax deduction, and the money is usable exactly when tuition is due. A 530A is locked until 18 and taxes earnings on withdrawal.',
    },
    {
      q: 'Then what is the 530A for?',
      a: 'The decades after college. Its edge is the free $1,000 federal seed (2025–2028 births), dead-simple low-fee index investing, and a lock-up to age 18 — after which Traditional-IRA rules reward leaving the money to compound toward retirement. As a retirement head start it can outgrow its college usefulness by an order of magnitude.',
    },
    {
      q: 'Can 530A money pay for college at 18?',
      a: 'Technically the child owns it at 18 under Traditional-IRA treatment, but tapping it then means paying ordinary income tax on the earnings — and possibly a penalty, pending final guidance. It is a poor college fund and an excellent retirement one.',
    },
    {
      q: 'Can a 530A roll into a 529, or a 529 into a 530A?',
      a: 'Neither is verified. The statute specifies Traditional-IRA treatment at 18 with no 529 rollover provision we can find, and 529→530A transfers are not provided for either. This site flags both paths "not currently permitted" until primary sources say otherwise.',
    },
    {
      q: 'How does financial aid treat each account?',
      a: 'A parent-owned 529 is counted as a parental asset on the FAFSA, which the federal aid formula assesses at a much lower rate than student-owned assets. How 530A balances will be treated for aid purposes is not yet settled in guidance — treat any claim you read as provisional, including ours.',
    },
    {
      q: 'What does “both” look like in practice?',
      a: 'A common split: automate what you can afford, route the first dollars to the 530A while its $1,000 seed and early years compound (capped at $5,000/yr anyway), and direct education-specific gifts and state-deductible dollars to the 529. Model your own split in the Advanced Model.',
    },
  ],
}

// Renders on /open-account AND feeds the HowTo structured data, llms-full.txt,
// and MCP search — one source, no drift. `link` renders as a trailing action
// on the web page only (structured data and the corpus use `text` alone).
export const openAccountSteps: {
  name: string
  text: string
  link?: { href: string; label: string }
}[] = [
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
    link: { href: 'https://trumpaccounts.gov', label: 'Portal: trumpaccounts.gov' },
  },
  {
    name: 'Choose a low-cost eligible fund',
    text: 'By law, 530A money must be invested in funds that track an index of primarily U.S. companies with a low, capped expense ratio. See our Resources page for a starter list. Lower fees mean more of the growth stays in your child’s account.',
    link: { href: '/resources', label: 'Eligible fund list →' },
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

/**
 * The one canonical "where to open an account" list — rendered on /resources
 * and referenced by the open-account steps and homepage copy, so the three
 * surfaces can't drift.
 */
export const whereToOpen: { label: string; href: string }[] = [
  { label: 'trumpaccounts.gov — the official portal', href: CANONICAL_LINKS.openAccount },
  {
    label: `${CANONICAL_LINKS.irsForm}, filed through your IRS online account`,
    href: 'https://www.irs.gov/forms-instructions',
  },
  {
    label: "The Treasury's Trump Accounts application",
    href: 'https://home.treasury.gov',
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
        `combined (expected to be indexed to inflation after 2027, mechanics pending guidance); ` +
        `employer contributions up to ` +
        `${usd(EMPLOYER_CAP_CENTS.value)}/yr within the cap; contributions permitted since ` +
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
      // One comparison doc (the old separate 530a-vs-529 doc overlapped ~70%).
      id: 'compare-accounts',
      title:
        '530A vs 529 vs UTMA/UGMA vs custodial Roth IRA — which for college, which for retirement',
      url: `${origin}/compare`,
      text:
        'The 530A shines as a decades-early retirement head start: free federal seed for ' +
        'eligible births, simple low-fee U.S. index funds, locked until 18, then ' +
        'Traditional-IRA-like. A 529 usually wins when the money is earmarked for education ' +
        '(tax-free qualified withdrawals, possible state deductions, usable at 18–22). A ' +
        'UTMA/UGMA custodial account is fully flexible but growth is taxed yearly (kiddie ' +
        'tax). A custodial Roth IRA offers tax-free retirement growth but requires the ' +
        'child’s own earned income. Neither the 530A nor the 529 can roll into the other as ' +
        'far as primary sources verify. Many families fund both: long horizon in the 530A, ' +
        'college in the 529.',
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
      id: 'withdrawal-rules',
      title: '530A withdrawal rules — when the money can come out',
      url: `${origin}/withdrawals`,
      text:
        'No withdrawals before the year the child turns 18 — no hardship or education ' +
        'carve-outs in the statute as verified. At 18 the child owns the account and it follows ' +
        'Traditional-IRA treatment: earnings taxed as ordinary income on withdrawal, ' +
        'penalty-free at 59½ with IRA-style exceptions before that (the exact 530A ' +
        'early-withdrawal penalty is pending confirmation). Only after-tax family ' +
        'contributions (basis) come out tax-free; the federal seed, employer money, and growth ' +
        'are taxable. After 18, converting to a Roth IRA taxes the non-basis amount once and ' +
        'makes later growth tax-free. A 529 rollover is not currently permitted as far as ' +
        'primary sources show.',
    },
    {
      id: 'contribution-timing',
      title: '530A contribution timing — start date, deadlines, caps by year',
      url: `${origin}/contribution-deadline`,
      text:
        'Contributions opened July 4, 2026 — none were permitted earlier, even for accounts ' +
        'opened before then. The $5,000 cap applies per child per calendar year across all ' +
        'sources combined and unused room does not roll over. The cap is expected to be ' +
        'indexed to inflation after 2027 (mechanics pending guidance). Contributions can be ' +
        'made until the year the child turns 18. Earlier money compounds longer, but ' +
        'consistency beats timing.',
    },
    {
      id: 'employer-contributions',
      title: '530A employer contributions — the $2,500 benefit',
      url: `${origin}/employer-contributions`,
      text:
        'Employers may contribute up to $2,500 per child per year to a 530A, counted within ' +
        'the $5,000 combined annual cap. Employer money is not basis — like the federal seed, ' +
        'it and its growth are taxed on withdrawal. Families should coordinate employer and ' +
        'family amounts so combined contributions stay inside the cap.',
    },
    {
      id: 'glossary',
      title: '530A glossary — key terms defined',
      url: `${origin}/glossary`,
      text:
        'Definitions of the terms around 530A accounts: basis (after-tax contributions, ' +
        'tax-free at withdrawal), variance drain (volatility’s drag on compounding), expense ' +
        'ratio (annual fund fee, ~0.03% for eligible funds), kiddie tax (yearly tax on ' +
        'custodial-account gains that 530As defer), Traditional-IRA treatment (the at-18 ' +
        'behavior), Roth conversion (paying tax once for tax-free growth), Monte Carlo ' +
        'percentile bands, and nominal vs real dollars.',
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
