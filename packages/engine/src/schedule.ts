import { type Cents, roundHalfToEven } from './money'
import type { CapWarning, ContributionSource, Scenario } from './types'

/**
 * Timeline + contribution stream. Contributions (and cap clipping) do not
 * depend on returns, so they are computed once here and shared verbatim by
 * the deterministic projection and every Monte-Carlo path.
 */

export interface YearMonth {
  year: number
  month: number // 1–12
}

export function parseYearMonth(iso: string): YearMonth {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new RangeError(`invalid ISO date: ${iso}`)
  const month = Number(m[2])
  if (month < 1 || month > 12) throw new RangeError(`invalid month in date: ${iso}`)
  return { year: Number(m[1]), month }
}

/** Whole months from a to b (month granularity; days ignored). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month)
}

export function addMonths(a: YearMonth, n: number): YearMonth {
  const total = a.year * 12 + (a.month - 1) + n
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/** Amount for a recurring source in its k-th year, with annual step-up,
 *  quantized to cents year by year (deterministic iteration). */
function steppedAmount(baseCents: Cents, stepUpRate: number, yearIndex: number): Cents {
  let amount = baseCents
  for (let k = 0; k < yearIndex; k++) {
    amount = roundHalfToEven(Number(amount) * (1 + stepUpRate))
  }
  return amount
}

/** What a source wants to contribute at a given age/calendar month (pre-cap). */
function desiredContribution(
  source: ContributionSource,
  ageMonths: number,
  calendarMonth: number,
): Cents {
  const sched = source.schedule
  const stepUp = source.stepUpRate ?? 0
  switch (sched.type) {
    case 'monthly': {
      if (ageMonths < sched.startAgeMonths || ageMonths >= sched.endAgeMonths) return 0n
      return steppedAmount(
        sched.amountCents,
        stepUp,
        Math.floor((ageMonths - sched.startAgeMonths) / 12),
      )
    }
    case 'annual': {
      if (ageMonths < sched.startAgeMonths || ageMonths >= sched.endAgeMonths) return 0n
      if (calendarMonth !== sched.monthOfYear) return 0n
      return steppedAmount(
        sched.amountCents,
        stepUp,
        Math.floor((ageMonths - sched.startAgeMonths) / 12),
      )
    }
    case 'once':
      return ageMonths === sched.atAgeMonths ? sched.amountCents : 0n
  }
}

export interface ContributionStream {
  /** Simulated months (steps). */
  months: number
  /** Child age in months at index 0 (the asOf month). */
  startAgeMonths: number
  /** Capped total contribution landing in month t (index 0 = first simulated month). */
  contributionCents: Cents[]
  /** Federal seed applied at opening (0n if ineligible or excluded). */
  seedCents: Cents
  warnings: CapWarning[]
}

export function validateScenario(scenario: Scenario): void {
  const { targetAgeMonths, sources, assumptions } = scenario
  if (!Number.isInteger(targetAgeMonths) || targetAgeMonths <= 0 || targetAgeMonths > 119 * 12) {
    throw new RangeError(`targetAgeMonths must be an integer in (0, ${119 * 12}]`)
  }
  if (assumptions.annualReturn <= -1) throw new RangeError('annualReturn must exceed -100%')
  if (assumptions.annualInflation <= -1) throw new RangeError('annualInflation must exceed -100%')
  if (assumptions.annualFee < 0 || assumptions.annualFee >= 1) {
    throw new RangeError('annualFee must be in [0, 1)')
  }
  if (assumptions.annualVolatility < 0 || assumptions.annualVolatility > 2) {
    throw new RangeError('annualVolatility must be in [0, 2]')
  }
  const ids = new Set<string>()
  for (const s of sources) {
    if (ids.has(s.id)) throw new RangeError(`duplicate source id: ${s.id}`)
    ids.add(s.id)
    if (s.schedule.amountCents < 0n) throw new RangeError(`source ${s.id}: negative contribution`)
    if (
      s.schedule.type === 'annual' &&
      (s.schedule.monthOfYear < 1 || s.schedule.monthOfYear > 12)
    ) {
      throw new RangeError(`source ${s.id}: monthOfYear must be 1-12`)
    }
    if (s.stepUpRate !== undefined && (s.stepUpRate < 0 || s.stepUpRate > 1)) {
      throw new RangeError(`source ${s.id}: stepUpRate must be in [0, 1]`)
    }
  }
}

export function buildContributionStream(scenario: Scenario): ContributionStream {
  validateScenario(scenario)
  const { child, rules, includeSeed, sources, targetAgeMonths } = scenario

  const asOf = parseYearMonth(scenario.asOf)
  const birth = parseYearMonth(child.birthDate)
  const floor = parseYearMonth(rules.contributionFloor)

  const startAgeMonths = monthsBetween(birth, asOf)
  if (startAgeMonths < 0) throw new RangeError('asOf precedes birth date')
  if (startAgeMonths >= targetAgeMonths) {
    throw new RangeError('targetAgeMonths must exceed the child age at asOf')
  }
  const months = targetAgeMonths - startAgeMonths

  const seedEligible =
    includeSeed &&
    child.birthDate >= rules.seedBirthWindow.start &&
    child.birthDate <= rules.seedBirthWindow.end

  const contributionCents: Cents[] = new Array(months)
  const warnings: CapWarning[] = []

  let capYear = asOf.year
  let usedAnnual = 0n
  let usedEmployer = 0n

  for (let t = 0; t < months; t++) {
    const current = addMonths(asOf, t)
    const ageMonths = startAgeMonths + t

    if (current.year !== capYear) {
      capYear = current.year
      usedAnnual = 0n
      usedEmployer = 0n
    }

    let monthTotal = 0n
    const beforeFloor =
      current.year < floor.year || (current.year === floor.year && current.month < floor.month)
    if (!beforeFloor) {
      for (const source of sources) {
        const desired = desiredContribution(source, ageMonths, current.month)
        if (desired === 0n) continue
        let allowed = desired
        if (source.kind === 'employer') {
          const room =
            usedEmployer < rules.employerAnnualCapCents
              ? rules.employerAnnualCapCents - usedEmployer
              : 0n
          if (allowed > room) {
            warnings.push({
              calendarYear: current.year,
              sourceId: source.id,
              excessCents: allowed - room,
              cap: 'employer',
            })
            allowed = room
          }
        }
        const room = usedAnnual < rules.annualCapCents ? rules.annualCapCents - usedAnnual : 0n
        if (allowed > room) {
          warnings.push({
            calendarYear: current.year,
            sourceId: source.id,
            excessCents: allowed - room,
            cap: 'annual',
          })
          allowed = room
        }
        if (allowed > 0n) {
          monthTotal += allowed
          usedAnnual += allowed
          if (source.kind === 'employer') usedEmployer += allowed
        }
      }
    }
    contributionCents[t] = monthTotal
  }

  return {
    months,
    startAgeMonths,
    contributionCents,
    seedCents: seedEligible ? rules.seedCents : 0n,
    warnings,
  }
}
