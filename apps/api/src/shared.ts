import {
  ANNUAL_CAP_CENTS,
  CANONICAL_LINKS,
  CANONICAL_ORIGIN,
  CONTRIBUTION_FLOOR_DATE,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  FLAGS,
  RULES_VERIFIED_AT,
  SEED_BIRTH_WINDOW,
} from '@530a/config'
import {
  decodeState,
  monteCarlo,
  project,
  type RuleSet,
  type Scenario,
  type ScenarioState,
  StateDecodeError,
} from '@530a/engine'
import { z } from 'zod'

/**
 * Shared core of the public API and the MCP server (§7A.2/7A.3): validate a
 * scenario (either the `?s=` string or explicit JSON), run the pure engine,
 * and shape an attributable response. Deterministic in → deterministic out,
 * which is what makes edge caching by input hash safe.
 */

export const RULES: RuleSet = {
  seedCents: FEDERAL_SEED_CENTS.value,
  seedBirthWindow: SEED_BIRTH_WINDOW.value,
  annualCapCents: ANNUAL_CAP_CENTS.value,
  employerAnnualCapCents: EMPLOYER_CAP_CENTS.value,
  contributionFloor: CONTRIBUTION_FLOOR_DATE.value,
}

export const DISCLAIMER =
  'Educational estimates, not financial advice. Ranges are Monte-Carlo percentiles under the stated assumptions, not guarantees.'

/**
 * CPU guard: Workers Free allows ~10ms CPU per invocation. Monte-Carlo work
 * scales with paths × months, so clamp paths to keep the budget; the response
 * reports the paths actually simulated. Raise MAX_STEPS after the Workers
 * Paid upgrade.
 */
const MAX_STEPS = 60_000

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const ScheduleSchema = z.union([
  z.object({
    type: z.literal('monthly'),
    amountCents: z.string().regex(/^\d{1,12}$/),
    startAgeMonths: z.number().int().min(0).max(1428),
    endAgeMonths: z.number().int().min(0).max(1428),
  }),
  z.object({
    type: z.literal('annual'),
    amountCents: z.string().regex(/^\d{1,12}$/),
    monthOfYear: z.number().int().min(1).max(12),
    startAgeMonths: z.number().int().min(0).max(1428),
    endAgeMonths: z.number().int().min(0).max(1428),
  }),
  z.object({
    type: z.literal('once'),
    amountCents: z.string().regex(/^\d{1,12}$/),
    atAgeMonths: z.number().int().min(0).max(1428),
  }),
])

export const ScenarioSchema = z.object({
  asOf: z.string().regex(isoDate),
  birthDate: z.string().regex(isoDate),
  includeSeed: z.boolean().default(true),
  annualReturn: z.number().min(-0.5).max(0.2).default(0.07),
  returnIsReal: z.boolean().default(true),
  annualInflation: z.number().min(0).max(0.2).default(0.025),
  annualFee: z.number().min(0).max(0.05).default(0.0003),
  annualVolatility: z.number().min(0).max(0.6).default(0.15),
  targetAgeMonths: z.number().int().min(1).max(1428),
  mcSeed: z.number().int().min(0).max(0xffffffff).default(530),
  mcPaths: z.number().int().min(100).max(5000).default(2000),
  sources: z
    .array(
      z.object({
        id: z.string().min(1).max(24),
        kind: z.enum(['family', 'relative', 'charity', 'employer']),
        stepUpRate: z.number().min(0).max(1).optional(),
        schedule: ScheduleSchema,
      }),
    )
    .max(8)
    .default([]),
})

export type ApiScenarioInput = z.infer<typeof ScenarioSchema>

export class BadRequest extends Error {}

export function stateFromInput(body: unknown): ScenarioState {
  if (
    typeof body === 'object' &&
    body !== null &&
    's' in body &&
    typeof (body as { s: unknown }).s === 'string'
  ) {
    try {
      return decodeState((body as { s: string }).s)
    } catch (e) {
      throw new BadRequest(e instanceof StateDecodeError ? e.message : 'invalid state string')
    }
  }
  const parsed = ScenarioSchema.safeParse(body)
  if (!parsed.success) {
    throw new BadRequest(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    )
  }
  const input = parsed.data
  return {
    asOf: input.asOf,
    child: { birthDate: input.birthDate },
    includeSeed: input.includeSeed,
    targetAgeMonths: input.targetAgeMonths,
    mcSeed: input.mcSeed,
    mcPaths: input.mcPaths,
    assumptions: {
      annualReturn: input.annualReturn,
      returnIsReal: input.returnIsReal,
      annualInflation: input.annualInflation,
      annualFee: input.annualFee,
      annualVolatility: input.annualVolatility,
    },
    sources: input.sources.map((s) => {
      const schedule =
        s.schedule.type === 'monthly'
          ? {
              type: 'monthly' as const,
              amountCents: BigInt(s.schedule.amountCents),
              startAgeMonths: s.schedule.startAgeMonths,
              endAgeMonths: s.schedule.endAgeMonths,
            }
          : s.schedule.type === 'annual'
            ? {
                type: 'annual' as const,
                amountCents: BigInt(s.schedule.amountCents),
                monthOfYear: s.schedule.monthOfYear,
                startAgeMonths: s.schedule.startAgeMonths,
                endAgeMonths: s.schedule.endAgeMonths,
              }
            : {
                type: 'once' as const,
                amountCents: BigInt(s.schedule.amountCents),
                atAgeMonths: s.schedule.atAgeMonths,
              }
      const source: ScenarioState['sources'][number] = { id: s.id, kind: s.kind, schedule }
      if (s.stepUpRate !== undefined && s.stepUpRate > 0) source.stepUpRate = s.stepUpRate
      return source
    }),
  }
}

export interface ProjectResult {
  schemaVersion: 1
  sourceUrl: string
  shareUrl: string
  disclaimer: string
  rulesVerifiedAt: string
  assumptions: ScenarioState['assumptions'] & {
    mcSeed: number
    mcPathsRequested: number
    mcPathsSimulated: number
  }
  deterministic: {
    months: number
    startAgeMonths: number
    finalNominalCents: string
    finalRealCents: string
    contributedCents: string
    seedCents: string
    growthCents: string
    milestones: { ageMonths: number; nominalCents: string; realCents: string }[]
    capWarnings: number
  }
  percentiles: {
    ages: number[]
    /** rows ordered p10, p25, p50, p75, p90 — nominal cents as strings */
    nominalCents: string[][]
    realCents: string[][]
  }
}

export function runScenario(state: ScenarioState): ProjectResult {
  const scenario: Scenario = {
    schemaVersion: 1,
    rules: RULES,
    asOf: state.asOf,
    child: state.child,
    includeSeed: state.includeSeed,
    sources: state.sources,
    assumptions: state.assumptions,
    targetAgeMonths: state.targetAgeMonths,
  }
  const projection = project(scenario)
  const clampedPaths = Math.max(
    100,
    Math.min(state.mcPaths, Math.floor(MAX_STEPS / Math.max(projection.months, 1))),
  )
  const mc = monteCarlo(scenario, state.mcSeed, clampedPaths)

  return {
    schemaVersion: 1,
    sourceUrl: CANONICAL_ORIGIN,
    shareUrl: `${CANONICAL_ORIGIN}/model`,
    disclaimer: DISCLAIMER,
    rulesVerifiedAt: RULES_VERIFIED_AT,
    assumptions: {
      ...state.assumptions,
      mcSeed: state.mcSeed,
      mcPathsRequested: state.mcPaths,
      mcPathsSimulated: clampedPaths,
    },
    deterministic: {
      months: projection.months,
      startAgeMonths: projection.startAgeMonths,
      finalNominalCents: String(projection.nominalCents[projection.months]),
      finalRealCents: String(projection.realCents[projection.months]),
      contributedCents: String(projection.breakdown.contributedCents),
      seedCents: String(projection.breakdown.seedCents),
      growthCents: String(projection.breakdown.growthCents),
      milestones: projection.milestones.map((m) => ({
        ageMonths: m.ageMonths,
        nominalCents: String(m.nominalCents),
        realCents: String(m.realCents),
      })),
      capWarnings: projection.warnings.length,
    },
    percentiles: {
      ages: mc.sampleAgesMonths,
      nominalCents: mc.percentileCents.map((row) => row.map(String)),
      realCents: mc.percentileRealCents.map((row) => row.map(String)),
    },
  }
}

/** Verified legal facts for explain_530a / GET /v1/rules. */
export function legalFacts() {
  return {
    sourceUrl: CANONICAL_ORIGIN,
    rulesVerifiedAt: RULES_VERIFIED_AT,
    disclaimer: DISCLAIMER,
    facts: {
      what: 'IRC §530A custodial investment account for minors ("Trump Account"), created by the One Big Beautiful Bill Act of 2025.',
      federalSeed:
        '$1,000 one-time for U.S.-citizen children born 2025-01-01 through 2028-12-31 with an SSN.',
      annualCap:
        '$5,000 per child per year from all sources combined, indexed to inflation after 2027.',
      employerCap: 'Employer contributions up to $2,500/yr, counted within the $5,000 cap.',
      contributionsStart: 'No contributions before 2026-07-04.',
      withdrawals:
        'None before 18; at 18 the child owns it and it behaves like a Traditional IRA (penalty-free at 59.5).',
      tax: 'Contributions are after-tax basis; growth tax-deferred; earnings taxed on withdrawal. Roth conversion taxes non-basis amounts.',
      investment: 'Low-cost S&P 500 index fund; default modeled fund SPYM (0.03% expense ratio).',
      openAt: 'trumpaccounts.gov, IRS Form 4547, or the Treasury Trump Accounts app.',
    },
    unverified: Object.fromEntries(
      Object.entries(FLAGS).map(([k, v]) => [k, { enabled: v.enabled, note: v.pendingReason }]),
    ),
    sources: CANONICAL_LINKS,
  }
}
