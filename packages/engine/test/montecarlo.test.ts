import { describe, expect, it } from 'vitest'
import { monteCarlo, PERCENTILES, percentileNearestRank } from '../src/montecarlo'
import { project } from '../src/project'
import type { ContributionSource, Scenario } from '../src/types'
import { baseScenario } from './helpers'

/** Lump-sum-only scenario (under the annual cap so nothing is clipped):
 *  analytic moments are known in closed form. */
function lumpSumScenario(sigma: number): Scenario {
  const lump: ContributionSource = {
    id: 'lump',
    kind: 'family',
    schedule: { type: 'once', amountCents: 400_000n, atAgeMonths: 6 }, // $4k at asOf
  }
  return baseScenario({
    includeSeed: false,
    sources: [lump],
    targetAgeMonths: 6 + 24, // 24 months of growth
    assumptions: {
      annualReturn: 0.07,
      returnIsReal: false,
      annualInflation: 0,
      annualFee: 0,
      annualVolatility: sigma,
    },
  })
}

describe('percentileNearestRank', () => {
  it('uses nearest-rank on the sorted array', () => {
    const xs = new Float64Array([10, 20, 30, 40])
    expect(percentileNearestRank(xs, 10)).toBe(10)
    expect(percentileNearestRank(xs, 25)).toBe(10)
    expect(percentileNearestRank(xs, 50)).toBe(20)
    expect(percentileNearestRank(xs, 75)).toBe(30)
    expect(percentileNearestRank(xs, 90)).toBe(40)
    expect(percentileNearestRank(xs, 100)).toBe(40)
  })
})

describe('monteCarlo', () => {
  it('σ = 0 reproduces the deterministic projection exactly', () => {
    const s = baseScenario({
      assumptions: {
        annualReturn: 0.07,
        returnIsReal: true,
        annualInflation: 0.025,
        annualFee: 0.0003,
        annualVolatility: 0,
      },
    })
    const det = project(s)
    const mc = monteCarlo(s, 42, 3)
    for (let j = 0; j < mc.sampleAgesMonths.length; j++) {
      const t = (mc.sampleAgesMonths[j] as number) - mc.startAgeMonths
      for (let i = 0; i < PERCENTILES.length; i++) {
        expect((mc.percentileCents[i] as bigint[])[j]).toBe(det.nominalCents[t])
      }
    }
  })

  it('is deterministic: same (scenario, seed, paths) → identical result', () => {
    const s = lumpSumScenario(0.15)
    const a = monteCarlo(s, 12345, 200)
    const b = monteCarlo(s, 12345, 200)
    expect(a).toEqual(b)
    const c = monteCarlo(s, 54321, 200)
    expect(a.percentileCents).not.toEqual(c.percentileCents)
  })

  it('percentiles are ordered p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 at every sample', () => {
    const mc = monteCarlo(baseScenario(), 7, 500)
    for (let j = 0; j < mc.sampleAgesMonths.length; j++) {
      for (let i = 1; i < PERCENTILES.length; i++) {
        const lo = (mc.percentileCents[i - 1] as bigint[])[j] as bigint
        const hi = (mc.percentileCents[i] as bigint[])[j] as bigint
        expect(hi >= lo).toBe(true)
      }
    }
  })

  it('matches closed-form lognormal moments (analytic cross-check)', () => {
    // W_n = L·Π exp(μ_m − σ_m²/2 + σ_m·Z_t): E[W] = L·(1+R)^(n/12),
    // Var[W] = L²·(1+R)^(2n/12)·(exp(n·σ_m²) − 1)
    const sigma = 0.15
    const s = lumpSumScenario(sigma)
    const n = 24
    const L = 400_000 // cents
    const paths = 8000

    // Collect terminal balances by re-deriving from percentile machinery is
    // lossy; instead run many paths and use the exact percentile grid at the
    // final sample with high resolution: use raw moments via a manual run.
    const mc = monteCarlo(s, 99, paths)
    const last = mc.sampleAgesMonths.length - 1
    const p50 = Number((mc.percentileCents[2] as bigint[])[last])

    const muM = Math.log(1.07) / 12
    const sigM = sigma / Math.sqrt(12)
    const mean = L * 1.07 ** (n / 12)
    const sd = Math.sqrt(mean * mean * (Math.exp(n * sigM * sigM) - 1))
    // Median of lognormal: L·exp(n·(μ_m − σ_m²/2))
    const median = L * Math.exp(n * (muM - (sigM * sigM) / 2))

    // p50 from 8k paths: standard error of the median ≈ 1.25·sd/√paths
    const se = (1.25 * sd) / Math.sqrt(paths)
    expect(Math.abs(p50 - median)).toBeLessThan(4 * se)

    // Mean/variance cross-check via p10..p90 spread sanity: p90 > mean > p10
    const p10 = Number((mc.percentileCents[0] as bigint[])[last])
    const p90 = Number((mc.percentileCents[4] as bigint[])[last])
    expect(p10).toBeLessThan(mean)
    expect(p90).toBeGreaterThan(median)
    // Lognormal p90/p10 ratio: exp(2·1.2816·σ_m·√n)
    const wantRatio = Math.exp(2 * 1.2815515655446004 * sigM * Math.sqrt(n))
    expect(p90 / p10).toBeGreaterThan(wantRatio * 0.9)
    expect(p90 / p10).toBeLessThan(wantRatio * 1.1)
  })

  it('median path brackets sensibly vs the deterministic projection', () => {
    // Deterministic uses the FULL expected return; the MC median is lower by
    // the volatility drag exp(−n·σ_m²/2). Verify the median sits between the
    // drag-adjusted value and the deterministic value.
    const s = lumpSumScenario(0.15)
    const det = project(s)
    const mc = monteCarlo(s, 31337, 8000)
    const last = mc.sampleAgesMonths.length - 1
    const detFinal = Number(det.nominalCents[det.months])
    const p50 = Number((mc.percentileCents[2] as bigint[])[last])
    const sigM = 0.15 / Math.sqrt(12)
    const drag = Math.exp((-24 * sigM * sigM) / 2)
    expect(p50).toBeLessThan(detFinal)
    expect(p50).toBeGreaterThan(detFinal * drag * 0.97)
  })

  it('rejects invalid path counts', () => {
    const s = baseScenario()
    expect(() => monteCarlo(s, 1, 0)).toThrow(RangeError)
    expect(() => monteCarlo(s, 1, 20_001)).toThrow(RangeError)
    expect(() => monteCarlo(s, 1, 1.5)).toThrow(RangeError)
  })
})
