import { describe, expect, it } from 'vitest'
import { detLn } from '../src/detmath'
import { monteCarlo } from '../src/montecarlo'
import { buildContributionStream, parseYearMonth } from '../src/schedule'
import { estimateRothConversion } from '../src/tax'
import { baseScenario, monthlySource } from './helpers'

describe('edge branches', () => {
  it('detLn rejects subnormals', () => {
    expect(() => detLn(5e-324)).toThrow(RangeError)
  })

  it('parseYearMonth rejects malformed dates', () => {
    expect(() => parseYearMonth('2026-7-1')).toThrow(RangeError)
    expect(() => parseYearMonth('2026-13-01')).toThrow(RangeError)
    expect(() => parseYearMonth('garbage')).toThrow(RangeError)
  })

  it('scenario validation rejects bad assumption ranges', () => {
    const bad = (a: Partial<ReturnType<typeof baseScenario>['assumptions']>) =>
      baseScenario({ assumptions: { ...baseScenario().assumptions, ...a } })
    expect(() => buildContributionStream(bad({ annualReturn: -1.5 }))).toThrow(RangeError)
    expect(() => buildContributionStream(bad({ annualInflation: -1 }))).toThrow(RangeError)
    expect(() => buildContributionStream(bad({ annualFee: 1 }))).toThrow(RangeError)
    expect(() => buildContributionStream(bad({ annualFee: -0.1 }))).toThrow(RangeError)
    expect(() => buildContributionStream(bad({ annualVolatility: 3 }))).toThrow(RangeError)
  })

  it('scenario validation rejects bad schedules', () => {
    expect(() =>
      buildContributionStream(
        baseScenario({
          sources: [
            {
              id: 'x',
              kind: 'relative',
              schedule: {
                type: 'annual',
                amountCents: 100n,
                monthOfYear: 13,
                startAgeMonths: 0,
                endAgeMonths: 216,
              },
            },
          ],
        }),
      ),
    ).toThrow(/monthOfYear/)
    expect(() =>
      buildContributionStream(
        baseScenario({ sources: [monthlySource('x', 100n, { stepUpRate: 2 })] }),
      ),
    ).toThrow(/stepUpRate/)
    expect(() => buildContributionStream(baseScenario({ targetAgeMonths: 6 }))).toThrow(
      /exceed the child age/,
    )
  })

  it('a source arriving after the cap is already full contributes nothing', () => {
    // Source a wants $5,000 in January (annual gift); source b then has zero room.
    const s = baseScenario({
      sources: [
        {
          id: 'a',
          kind: 'family',
          schedule: {
            type: 'annual',
            amountCents: 500_000n,
            monthOfYear: 1,
            startAgeMonths: 0,
            endAgeMonths: 216,
          },
        },
        monthlySource('b', 10_000n),
      ],
    })
    const stream = buildContributionStream(s)
    // In full calendar years the total is exactly the cap
    let y2027 = 0n
    for (let t = 6; t < 18; t++) y2027 += stream.contributionCents[t] as bigint
    expect(y2027).toBe(500_000n)
    const bWarnings = stream.warnings.filter((w) => w.sourceId === 'b')
    expect(bWarnings.length).toBeGreaterThan(0)
    // Every clipped cent is accounted for: desired - contributed = excess
    const totalExcess2027 = stream.warnings
      .filter((w) => w.calendarYear === 2027)
      .reduce((acc, w) => acc + w.excessCents, 0n)
    expect(totalExcess2027).toBe(500_000n + 120_000n - 500_000n)
  })

  it('employer source with zero remaining employer room contributes nothing more', () => {
    const s = baseScenario({
      sources: [
        {
          id: 'emp',
          kind: 'employer',
          schedule: {
            type: 'annual',
            amountCents: 300_000n, // wants $3,000 in one shot vs $2,500 sub-cap
            monthOfYear: 1,
            startAgeMonths: 0,
            endAgeMonths: 216,
          },
        },
      ],
    })
    const stream = buildContributionStream(s)
    let y2027 = 0n
    for (let t = 6; t < 18; t++) y2027 += stream.contributionCents[t] as bigint
    expect(y2027).toBe(250_000n)
    expect(stream.warnings.some((w) => w.cap === 'employer')).toBe(true)
  })

  it('monte carlo samples include t=0 when the child age is a multiple of 12', () => {
    const s = baseScenario({ child: { birthDate: '2025-07-20' }, asOf: '2026-07-12' })
    const mc = monteCarlo(s, 5, 10)
    expect(mc.sampleAgesMonths[0]).toBe(12)
    expect(mc.startAgeMonths).toBe(12)
  })

  it('roth conversion with zero earnings has zero tax', () => {
    const e = estimateRothConversion(1_000n, 1_000n, 0.2)
    expect(e.taxCents).toBe(0n)
  })
})
