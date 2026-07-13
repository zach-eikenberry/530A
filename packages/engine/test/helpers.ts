import type { ContributionSource, RuleSet, Scenario } from '../src/types'

/** Statutory defaults duplicated from @530a/config — the engine package
 *  stays dependency-free, and tests pin these independently anyway. */
export const TEST_RULES: RuleSet = {
  seedCents: 100_000n,
  seedBirthWindow: { start: '2025-01-01', end: '2028-12-31' },
  annualCapCents: 500_000n,
  employerAnnualCapCents: 250_000n,
  contributionFloor: '2026-07-04',
}

export function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    schemaVersion: 1,
    asOf: '2026-07-12',
    child: { birthDate: '2026-01-15' },
    includeSeed: true,
    sources: [monthlySource('parent', 10_000n)],
    assumptions: {
      annualReturn: 0.07,
      returnIsReal: true,
      annualInflation: 0.025,
      annualFee: 0.0003,
      annualVolatility: 0.15,
    },
    targetAgeMonths: 18 * 12,
    rules: TEST_RULES,
    ...overrides,
  }
}

export function monthlySource(
  id: string,
  amountCents: bigint,
  opts: {
    start?: number
    end?: number
    kind?: ContributionSource['kind']
    stepUpRate?: number
  } = {},
): ContributionSource {
  const source: ContributionSource = {
    id,
    kind: opts.kind ?? 'family',
    schedule: {
      type: 'monthly',
      amountCents,
      startAgeMonths: opts.start ?? 0,
      endAgeMonths: opts.end ?? 18 * 12,
    },
  }
  if (opts.stepUpRate !== undefined) source.stepUpRate = opts.stepUpRate
  return source
}
