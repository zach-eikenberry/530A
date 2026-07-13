import type { Cents } from './money'

/**
 * Scenario schema — the engine's single input shape. The `?s=` URL state,
 * the public API body, and the golden fixtures all serialize this.
 *
 * Conventions:
 * - Money is integer cents (bigint).
 * - Ages are integer months (age 18 = 216 months) for exact timeline math.
 * - Dates are ISO `YYYY-MM-DD` strings; the engine only uses year+month.
 * - The clock is injected via `asOf` — the engine never reads Date.now().
 */

export type SourceKind = 'family' | 'relative' | 'charity' | 'employer'

export type ContributionSchedule =
  | {
      type: 'monthly'
      amountCents: Cents
      /** Contribute while child age (months) is in [startAgeMonths, endAgeMonths). */
      startAgeMonths: number
      endAgeMonths: number
    }
  | {
      type: 'annual'
      amountCents: Cents
      /** Calendar month contributed each year, 1–12 (e.g. birthday month). */
      monthOfYear: number
      startAgeMonths: number
      endAgeMonths: number
    }
  | {
      type: 'once'
      amountCents: Cents
      /** Single contribution the month the child reaches this age. */
      atAgeMonths: number
    }

export interface ContributionSource {
  id: string
  kind: SourceKind
  schedule: ContributionSchedule
  /**
   * Optional +X%/yr escalation for recurring schedules (0 = off). Applied on
   * each 12-month anniversary of the source's start; each year's amount is
   * quantized to cents before use.
   */
  stepUpRate?: number
}

export interface Assumptions {
  /** Annual return, e.g. 0.07. Interpreted per `returnIsReal`. */
  annualReturn: number
  /** True → annualReturn is inflation-adjusted; nominal = (1+r)(1+i)−1. */
  returnIsReal: boolean
  /** Annual inflation for real↔nominal conversion, e.g. 0.025. */
  annualInflation: number
  /** Annual fee drag (expense ratio), e.g. 0.0003. */
  annualFee: number
  /** Annual volatility σ for Monte Carlo, e.g. 0.15. */
  annualVolatility: number
}

/** Statutory parameters — injected so the engine stays dependency-free.
 *  Defaults come from @530a/config at the call site. */
export interface RuleSet {
  seedCents: Cents
  /** Seed eligibility birth window (inclusive ISO dates). */
  seedBirthWindow: { start: string; end: string }
  annualCapCents: Cents
  employerAnnualCapCents: Cents
  /** No contributions before this date. */
  contributionFloor: string
}

export interface Scenario {
  schemaVersion: 1
  /** Injected "today" — projection starts this calendar month. */
  asOf: string
  child: { birthDate: string }
  /** Include the federal seed (only takes effect if birth date qualifies). */
  includeSeed: boolean
  sources: ContributionSource[]
  assumptions: Assumptions
  /** Project through this age (months). 0 < targetAgeMonths ≤ 119·12. */
  targetAgeMonths: number
  rules: RuleSet
}

export interface CapWarning {
  calendarYear: number
  sourceId: string
  /** Cents that could not be contributed because a cap was hit. */
  excessCents: Cents
  cap: 'annual' | 'employer'
}

export interface Milestone {
  ageMonths: number
  nominalCents: Cents
  /** Same balance deflated to as-of dollars. */
  realCents: Cents
}

export interface Projection {
  schemaVersion: 1
  /** Number of simulated months (steps). Balances arrays have months+1 entries. */
  months: number
  /** Child's age in months at each index (index 0 = asOf month). */
  startAgeMonths: number
  /** Nominal balance in cents after each month (index 0 = opening balance). */
  nominalCents: Cents[]
  /** Balance deflated to as-of dollars at each index. */
  realCents: Cents[]
  milestones: Milestone[]
  breakdown: {
    contributedCents: Cents
    seedCents: Cents
    /** growth = final nominal − contributions − seed (net of fees). */
    growthCents: Cents
  }
  warnings: CapWarning[]
}
