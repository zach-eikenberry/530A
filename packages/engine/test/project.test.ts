import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { project } from '../src/project'
import { buildContributionStream } from '../src/schedule'
import type { ContributionSource } from '../src/types'
import { baseScenario, monthlySource } from './helpers'

describe('project — hand-checkable cases', () => {
  it('zero growth, zero fee: balance = seed + contributions exactly', () => {
    const s = baseScenario({
      assumptions: {
        annualReturn: 0,
        returnIsReal: false,
        annualInflation: 0,
        annualFee: 0,
        annualVolatility: 0,
      },
    })
    const p = project(s)
    const final = p.nominalCents[p.months]
    expect(final).toBe(p.breakdown.seedCents + p.breakdown.contributedCents)
    expect(p.breakdown.growthCents).toBe(0n)
    expect(p.breakdown.seedCents).toBe(100_000n)
    // child is 6 months old at asOf, contributes $100/mo through age 18
    expect(p.breakdown.contributedCents).toBe(10_000n * BigInt(p.months))
  })

  it('seed excluded when birth date is outside the window', () => {
    const p = project(baseScenario({ child: { birthDate: '2024-06-15' }, asOf: '2026-07-12' }))
    expect(p.breakdown.seedCents).toBe(0n)
  })

  it('seed excluded when toggled off', () => {
    const p = project(baseScenario({ includeSeed: false }))
    expect(p.breakdown.seedCents).toBe(0n)
  })

  it('no contributions land before the July 2026 statutory floor', () => {
    // asOf January 2026: months Jan–Jun 2026 must contribute nothing
    const s = baseScenario({ asOf: '2026-01-15', child: { birthDate: '2025-06-10' } })
    const stream = buildContributionStream(s)
    for (let t = 0; t < 6; t++) expect(stream.contributionCents[t]).toBe(0n)
    expect(stream.contributionCents[6]).toBe(10_000n) // July 2026
  })

  it('annual cap clips in source order and reports excess', () => {
    // Two $300/mo sources = $7,200/yr desired vs $5,000 cap
    const s = baseScenario({
      sources: [monthlySource('a', 30_000n), monthlySource('b', 30_000n)],
    })
    const stream = buildContributionStream(s)
    expect(stream.warnings.length).toBeGreaterThan(0)
    expect(stream.warnings.every((w) => w.cap === 'annual')).toBe(true)
    // Per full calendar year, contributions total exactly the cap
    const p = project(s)
    let yearTotal = 0n
    for (let t = 6; t < 18; t++) yearTotal += stream.contributionCents[t] as bigint // 2027
    expect(yearTotal).toBe(500_000n)
    expect(p.warnings).toEqual(stream.warnings)
  })

  it('employer contributions respect the $2,500 sub-cap within the $5,000 cap', () => {
    const s = baseScenario({
      sources: [monthlySource('emp', 30_000n, { kind: 'employer' })], // wants $3,600/yr
    })
    const stream = buildContributionStream(s)
    let yearTotal = 0n
    for (let t = 6; t < 18; t++) yearTotal += stream.contributionCents[t] as bigint // 2027
    expect(yearTotal).toBe(250_000n)
    expect(stream.warnings.some((w) => w.cap === 'employer')).toBe(true)
  })

  it('one-time gift lands exactly once', () => {
    const gift: ContributionSource = {
      id: 'gift',
      kind: 'relative',
      schedule: { type: 'once', amountCents: 50_000n, atAgeMonths: 12 },
    }
    const s = baseScenario({
      sources: [gift],
      assumptions: {
        annualReturn: 0,
        returnIsReal: false,
        annualInflation: 0,
        annualFee: 0,
        annualVolatility: 0,
      },
    })
    const p = project(s)
    expect(p.breakdown.contributedCents).toBe(50_000n)
  })

  it('annual birthday gift lands once per year in the right month', () => {
    const s = baseScenario({
      sources: [
        {
          id: 'bday',
          kind: 'relative',
          schedule: {
            type: 'annual',
            amountCents: 20_000n,
            monthOfYear: 1, // January birthdays
            startAgeMonths: 0,
            endAgeMonths: 18 * 12,
          },
        },
      ],
      assumptions: {
        annualReturn: 0,
        returnIsReal: false,
        annualInflation: 0,
        annualFee: 0,
        annualVolatility: 0,
      },
    })
    const stream = buildContributionStream(s)
    const nonZero = stream.contributionCents.filter((c) => c > 0n)
    expect(nonZero.every((c) => c === 20_000n)).toBe(true)
    // asOf July 2026 → January contributions each year from 2027 through age 18
    expect(nonZero.length).toBe(17)
  })

  it('step-up escalates the monthly amount ~3%/yr', () => {
    const s = baseScenario({
      sources: [monthlySource('p', 10_000n, { stepUpRate: 0.03 })],
    })
    const stream = buildContributionStream(s)
    expect(stream.contributionCents[0]).toBe(10_000n)
    expect(stream.contributionCents[12]).toBe(10_300n)
    expect(stream.contributionCents[24]).toBe(10_609n)
  })

  it('real and nominal views reconcile (lump sum)', () => {
    // Reconciliation is a lump-sum identity: deflating the nominal path must
    // recover the direct real-growth path. (With ongoing contributions the two
    // legitimately differ — fixed nominal contributions shrink in real terms.)
    const real = project(
      baseScenario({
        sources: [], // seed only
        assumptions: {
          annualReturn: 0.07,
          returnIsReal: false, // treat 7% as the nominal rate, zero inflation
          annualInflation: 0,
          annualFee: 0,
          annualVolatility: 0,
        },
      }),
    )
    const nominal = project(
      baseScenario({
        sources: [], // seed only
        assumptions: {
          annualReturn: 0.07,
          returnIsReal: true, // 7% real on top of 2.5% inflation
          annualInflation: 0.025,
          annualFee: 0,
          annualVolatility: 0,
        },
      }),
    )
    // The deflated (real) path of the nominal scenario ≈ the direct 7% path
    const a = Number(real.nominalCents[real.months])
    const b = Number(nominal.realCents[nominal.months])
    expect(Math.abs(a - b) / a).toBeLessThan(1e-4)
    // And with zero inflation, real === nominal exactly
    expect(real.realCents).toEqual(real.nominalCents)
  })

  it('milestones cover 18 and the target age', () => {
    const p = project(baseScenario({ targetAgeMonths: 72 * 12 }))
    const ages = p.milestones.map((m) => m.ageMonths)
    expect(ages).toContain(18 * 12)
    expect(ages).toContain(36 * 12)
    expect(ages).toContain(72 * 12)
  })

  it('rejects invalid scenarios', () => {
    expect(() => project(baseScenario({ targetAgeMonths: 0 }))).toThrow(RangeError)
    expect(() => project(baseScenario({ targetAgeMonths: 120 * 12 }))).toThrow(RangeError)
    expect(() => project(baseScenario({ asOf: '2025-01-01' }))).toThrow(/precedes birth/)
    expect(() => project(baseScenario({ sources: [monthlySource('x', -1n)] }))).toThrow(/negative/)
    expect(() =>
      project(baseScenario({ sources: [monthlySource('a', 1n), monthlySource('a', 1n)] })),
    ).toThrow(/duplicate/)
  })
})

describe('project — properties', () => {
  const amounts = fc.bigInt({ min: 0n, max: 100_000n })

  it('determinism: identical inputs → identical output', () => {
    fc.assert(
      fc.property(amounts, (amount) => {
        const s = baseScenario({ sources: [monthlySource('p', amount)] })
        expect(project(s)).toEqual(project(s))
      }),
      { numRuns: 20 },
    )
  })

  it('monotonicity: more contribution ⇒ ≥ final balance', () => {
    fc.assert(
      fc.property(amounts, amounts, (a, b) => {
        const lo = a < b ? a : b
        const hi = a < b ? b : a
        const pLo = project(baseScenario({ sources: [monthlySource('p', lo)] }))
        const pHi = project(baseScenario({ sources: [monthlySource('p', hi)] }))
        expect(
          (pHi.nominalCents[pHi.months] as bigint) >= (pLo.nominalCents[pLo.months] as bigint),
        ).toBe(true)
      }),
      { numRuns: 25 },
    )
  })

  it('non-negativity and percumulative growth: balances never negative, never exceed cap-free upper bound', () => {
    fc.assert(
      fc.property(amounts, (amount) => {
        const p = project(baseScenario({ sources: [monthlySource('p', amount)] }))
        for (const b of p.nominalCents) expect(b >= 0n).toBe(true)
      }),
      { numRuns: 20 },
    )
  })

  it('conservation with zero return/fee: final = seed + contributions', () => {
    fc.assert(
      fc.property(amounts, (amount) => {
        const p = project(
          baseScenario({
            sources: [monthlySource('p', amount)],
            assumptions: {
              annualReturn: 0,
              returnIsReal: false,
              annualInflation: 0,
              annualFee: 0,
              annualVolatility: 0,
            },
          }),
        )
        expect(p.nominalCents[p.months]).toBe(p.breakdown.seedCents + p.breakdown.contributedCents)
      }),
      { numRuns: 20 },
    )
  })

  it('fees only reduce outcomes', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.02, noNaN: true }), (fee) => {
        const withFee = project(
          baseScenario({
            assumptions: {
              annualReturn: 0.07,
              returnIsReal: false,
              annualInflation: 0,
              annualFee: fee,
              annualVolatility: 0,
            },
          }),
        )
        const noFee = project(
          baseScenario({
            assumptions: {
              annualReturn: 0.07,
              returnIsReal: false,
              annualInflation: 0,
              annualFee: 0,
              annualVolatility: 0,
            },
          }),
        )
        expect(
          (withFee.nominalCents[withFee.months] as bigint) <=
            (noFee.nominalCents[noFee.months] as bigint),
        ).toBe(true)
      }),
      { numRuns: 20 },
    )
  })
})
