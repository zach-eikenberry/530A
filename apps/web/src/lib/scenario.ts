import {
  ANNUAL_CAP_CENTS,
  CONTRIBUTION_FLOOR_DATE,
  DEFAULTS,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  SEED_BIRTH_WINDOW,
} from '@530a/config'
import {
  encodeState,
  type Projection,
  project,
  type RuleSet,
  type Scenario,
  type ScenarioState,
} from '@530a/engine'

/** RuleSet assembled from config — the single place UI code binds law → engine. */
export const RULES: RuleSet = {
  seedCents: FEDERAL_SEED_CENTS.value,
  seedBirthWindow: SEED_BIRTH_WINDOW.value,
  annualCapCents: ANNUAL_CAP_CENTS.value,
  employerAnnualCapCents: EMPLOYER_CAP_CENTS.value,
  contributionFloor: CONTRIBUTION_FLOOR_DATE.value,
}

export interface WidgetInputs {
  /** Child's current age in whole years (0–17). */
  ageYears: number
  /** Monthly contribution in whole dollars. */
  monthlyDollars: number
  /** Optional one-time starting amount in whole dollars. */
  oneTimeDollars: number
  includeSeed: boolean
  /** Assumed real annual return in percent (widget presets 5/7/10; default 7). */
  annualReturnPct?: number
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Derive a birth date exactly ageYears*12 months before asOf (same day-of-month). */
export function birthDateForAge(ageYears: number, asOf: Date): string {
  const d = new Date(asOf)
  d.setFullYear(d.getFullYear() - ageYears)
  return isoDate(d)
}

export function widgetState(inputs: WidgetInputs, asOf: Date): ScenarioState {
  const startAgeMonths = inputs.ageYears * 12
  const sources: ScenarioState['sources'] = []
  if (inputs.monthlyDollars > 0) {
    sources.push({
      id: 'family',
      kind: 'family',
      schedule: {
        type: 'monthly',
        amountCents: BigInt(Math.round(inputs.monthlyDollars)) * 100n,
        startAgeMonths,
        endAgeMonths: 18 * 12,
      },
    })
  }
  if (inputs.oneTimeDollars > 0) {
    sources.push({
      id: 'starting',
      kind: 'family',
      schedule: {
        type: 'once',
        amountCents: BigInt(Math.round(inputs.oneTimeDollars)) * 100n,
        atAgeMonths: startAgeMonths,
      },
    })
  }
  return {
    asOf: isoDate(asOf),
    child: { birthDate: birthDateForAge(inputs.ageYears, asOf) },
    includeSeed: inputs.includeSeed,
    sources,
    assumptions: {
      annualReturn: (inputs.annualReturnPct ?? DEFAULTS.annualRealReturn * 100) / 100,
      returnIsReal: true,
      annualInflation: 0.025,
      annualFee: DEFAULTS.annualFee,
      annualVolatility: 0.15,
    },
    targetAgeMonths: DEFAULTS.targetAge * 12,
    mcSeed: 530,
    mcPaths: DEFAULTS.monteCarlo.defaultPaths,
  }
}

export function toScenario(state: ScenarioState): Scenario {
  const { mcSeed: _s, mcPaths: _p, ...rest } = state
  return { schemaVersion: 1, rules: RULES, ...rest }
}

export interface WidgetResult {
  projection: Projection
  shareState: string
  seedEligible: boolean
}

export function runWidget(inputs: WidgetInputs, asOf: Date): WidgetResult {
  const state = widgetState(inputs, asOf)
  const projection = project(toScenario(state))
  return {
    projection,
    shareState: encodeState(state),
    seedEligible: projection.breakdown.seedCents > 0n,
  }
}

/** Milestone real-dollar value at a given age (years), if projected. */
export function milestoneAt(projection: Projection, ageYears: number): bigint | null {
  const m = projection.milestones.find((x) => x.ageMonths === ageYears * 12)
  return m ? m.realCents : null
}
