/**
 * IRC §530A ground truth. Every figure carries a source URL and a verifiedAt
 * date; the UI surfaces "Rules verified as of {date}" from RULES_VERIFIED_AT.
 *
 * Money is integer cents (see packages/engine numeric contract).
 */

export interface SourcedFigure<T> {
  value: T
  source: string
  verifiedAt: string // ISO date
  note?: string
}

export const RULES_VERIFIED_AT = '2026-07-12'

const STATUTE_URL =
  'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section530A'
const IRS_NOTICE_URL = 'https://www.irs.gov/pub/irs-drop/n-25-68.pdf'
const CRS_URL = 'https://www.congress.gov/crs-product/R48910'

/** One-time federal seed for eligible children, in cents. */
export const FEDERAL_SEED_CENTS: SourcedFigure<bigint> = {
  value: 100_000n,
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
  note: 'One-time $1,000; U.S.-citizen children born in the eligibility window with an SSN.',
}

/** Birth-date window for the federal seed (inclusive). */
export const SEED_BIRTH_WINDOW: SourcedFigure<{ start: string; end: string }> = {
  value: { start: '2025-01-01', end: '2028-12-31' },
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
}

/** Aggregate annual contribution cap per child, in cents. Indexed to inflation after 2027. */
export const ANNUAL_CAP_CENTS: SourcedFigure<bigint> = {
  value: 500_000n,
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
  note: 'Indexed to inflation after 2027; exact indexing mechanics pending (see feature flags).',
}

/** Employer contribution limit per year, in cents. Counted WITHIN the annual cap. */
export const EMPLOYER_CAP_CENTS: SourcedFigure<bigint> = {
  value: 250_000n,
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
}

/** No contributions permitted before this date. */
export const CONTRIBUTION_FLOOR_DATE: SourcedFigure<string> = {
  value: '2026-07-04',
  source: IRS_NOTICE_URL,
  verifiedAt: RULES_VERIFIED_AT,
}

/** No withdrawals before this age; at this age the child owns the account. */
export const WITHDRAWAL_AGE: SourcedFigure<number> = {
  value: 18,
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
  note: 'At 18 the account behaves like a Traditional IRA (penalty-free at 59½; IRA-style exceptions).',
}

/** IRA-style penalty-free withdrawal age after 18. */
export const IRA_PENALTY_FREE_AGE: SourcedFigure<number> = {
  value: 59.5,
  source: CRS_URL,
  verifiedAt: RULES_VERIFIED_AT,
}

/**
 * Assumed early-withdrawal penalty rate (IRA-style 10%).
 * UNVERIFIED for 530A specifically — gated behind flags.earlyWithdrawalPenalty.
 */
export const ASSUMED_EARLY_WITHDRAWAL_PENALTY: SourcedFigure<number> = {
  value: 0.1,
  source: CRS_URL,
  verifiedAt: RULES_VERIFIED_AT,
  note: 'Assumption pending confirmation; do not present as fact while the flag is off.',
}

/** Tax treatment: after-tax basis in, tax-deferred growth, earnings taxed on withdrawal. */
export const TAX_TREATMENT: SourcedFigure<'traditional-ira-like'> = {
  value: 'traditional-ira-like',
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
  note: 'Contributions are after-tax basis; growth tax-deferred; earnings taxed on withdrawal. Roth conversion taxes non-basis amounts.',
}

/** One funded account per child. */
export const ONE_ACCOUNT_PER_CHILD: SourcedFigure<true> = {
  value: true,
  source: STATUTE_URL,
  verifiedAt: RULES_VERIFIED_AT,
}

/** Default modeling assumptions (product decisions, not law). */
export const DEFAULTS = {
  /** Annual real return used by the simple widget. */
  annualRealReturn: 0.07,
  /** Default annual fee (SPYM expense ratio). */
  annualFee: 0.0003,
  /** Default target age for projections. */
  targetAge: 72,
  /** Milestone ages shown in headlines. */
  milestoneAges: [18, 36, 72],
  /** Maximum modelable age. */
  maxAge: 119,
  /** Monte Carlo defaults. */
  monteCarlo: { defaultPaths: 5_000, maxPaths: 20_000, percentiles: [10, 25, 50, 75, 90] },
} as const
