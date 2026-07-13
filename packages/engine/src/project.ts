import { detExp, detLn } from './detmath'
import { type Cents, roundHalfToEven } from './money'
import { buildContributionStream } from './schedule'
import type { Milestone, Projection, Scenario } from './types'

/**
 * Deterministic projection (§9.3). Exact order of operations each month:
 *   1. add the month's (cap-clipped) contributions — integer cents
 *   2. growth factor, then fee factor, then ONE quantization to cents:
 *      balance = roundHalfToEven(Number(balance) · g · f)
 * Real (as-of dollars) values deflate each month's nominal balance once:
 *      real = roundHalfToEven(Number(nominal) / (1+i)^(t/12))
 * The Python reference mirrors this operation-for-operation; golden vectors
 * must match to the cent.
 */

/** Monthly growth/fee/deflator factors from annual assumptions. */
export function monthlyFactors(scenario: Scenario): { g: number; f: number; d: number } {
  const a = scenario.assumptions
  const annualNominal = a.returnIsReal
    ? (1 + a.annualReturn) * (1 + a.annualInflation) - 1
    : a.annualReturn
  return {
    g: detExp(detLn(1 + annualNominal) / 12),
    f: detExp(detLn(1 - a.annualFee) / 12),
    d: detExp(detLn(1 + a.annualInflation) / 12),
  }
}

export function project(scenario: Scenario): Projection {
  const stream = buildContributionStream(scenario)
  const { months, startAgeMonths, contributionCents, seedCents, warnings } = stream
  const { g, f, d } = monthlyFactors(scenario)

  const nominalCents: Cents[] = new Array(months + 1)
  const realCents: Cents[] = new Array(months + 1)

  let balance = seedCents
  let contributed = 0n
  let deflator = 1
  nominalCents[0] = balance
  realCents[0] = balance

  for (let t = 1; t <= months; t++) {
    const c = contributionCents[t - 1] as Cents
    balance += c
    contributed += c
    balance = roundHalfToEven(Number(balance) * g * f)
    deflator *= d
    nominalCents[t] = balance
    realCents[t] = roundHalfToEven(Number(balance) / deflator)
  }

  const milestoneAges = [18 * 12, 36 * 12, 72 * 12, scenario.targetAgeMonths]
  const milestones: Milestone[] = []
  for (const age of milestoneAges) {
    const idx = age - startAgeMonths
    if (idx < 0 || idx > months) continue
    if (milestones.some((m) => m.ageMonths === age)) continue
    milestones.push({
      ageMonths: age,
      nominalCents: nominalCents[idx] as Cents,
      realCents: realCents[idx] as Cents,
    })
  }

  return {
    schemaVersion: 1,
    months,
    startAgeMonths,
    nominalCents,
    realCents,
    milestones,
    breakdown: {
      contributedCents: contributed,
      seedCents,
      growthCents: (nominalCents[months] as Cents) - contributed - seedCents,
    },
    warnings,
  }
}
