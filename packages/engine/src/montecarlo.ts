import { detExp, detLn } from './detmath'
import { type Cents, roundHalfToEven } from './money'
import { Xoshiro128StarStar } from './prng'
import { monthlyFactors } from './project'
import { buildContributionStream } from './schedule'
import type { Scenario } from './types'

/**
 * Monte Carlo (§9.4): monthly geometric Brownian motion.
 *
 * Each month every path applies the same cap-clipped contributions as the
 * deterministic projection, then a random gross factor
 *     exp(μ_m − σ_m²/2 + σ_m·Z) · f
 * with μ_m = ln(1 + annualNominal)/12, σ_m = σ/√12, Z ~ N(0,1) from the
 * seeded PRNG, f the monthly fee factor — then one quantization to cents.
 * With σ = 0 every path reproduces the deterministic projection exactly.
 *
 * Determinism: (scenario, seed, paths) → identical percentiles everywhere.
 * Draw order is fixed: paths are advanced one month at a time, path 0 first,
 * one normal per path per month.
 */

export const DEFAULT_PATHS = 5_000
export const MAX_PATHS = 20_000

/** Percentiles reported, low → high. */
export const PERCENTILES = [10, 25, 50, 75, 90] as const

export interface MonteCarloResult {
  schemaVersion: 1
  seed: number
  paths: number
  months: number
  startAgeMonths: number
  /** Ages (months) at which the fan/percentiles are sampled — every 12 months + final. */
  sampleAgesMonths: number[]
  /** percentileCents[i][j] = balance at sampleAgesMonths[j] for PERCENTILES[i], nominal cents. */
  percentileCents: Cents[][]
  /** Same, deflated to as-of dollars. */
  percentileRealCents: Cents[][]
}

/** Nearest-rank percentile on an ascending-sorted array (deterministic). */
export function percentileNearestRank(sortedAscending: Float64Array, p: number): number {
  const n = sortedAscending.length
  const rank = Math.ceil((p / 100) * n)
  const idx = Math.min(Math.max(rank, 1), n) - 1
  return sortedAscending[idx] as number
}

export function monteCarlo(
  scenario: Scenario,
  seed: number,
  paths = DEFAULT_PATHS,
): MonteCarloResult {
  if (!Number.isInteger(paths) || paths < 1 || paths > MAX_PATHS) {
    throw new RangeError(`paths must be an integer in [1, ${MAX_PATHS}]`)
  }
  const stream = buildContributionStream(scenario)
  const { months, startAgeMonths, contributionCents, seedCents } = stream
  const { f, d } = monthlyFactors(scenario)

  const a = scenario.assumptions
  const annualNominal = a.returnIsReal
    ? (1 + a.annualReturn) * (1 + a.annualInflation) - 1
    : a.annualReturn
  const muM = detLn(1 + annualNominal) / 12
  const sigmaM = a.annualVolatility / Math.sqrt(12)
  const drift = muM - (sigmaM * sigmaM) / 2

  // Sample the fan annually (every 12 months of age) plus the final month.
  const sampleIdx: number[] = []
  for (let t = 0; t <= months; t++) {
    const age = startAgeMonths + t
    if (age % 12 === 0 || t === months) sampleIdx.push(t)
  }

  const rng = new Xoshiro128StarStar(seed)
  // Balances in cent units held as float64 (exact for |v| < 2^53), quantized each month.
  const balances = new Float64Array(paths)
  const seedNum = Number(seedCents)
  balances.fill(seedNum)

  const nSamples = sampleIdx.length
  const samples: Float64Array[] = Array.from({ length: nSamples }, () => new Float64Array(paths))
  let s = 0
  if (sampleIdx[0] === 0) {
    ;(samples[0] as Float64Array).fill(seedNum)
    s = 1
  }

  let deflator = 1
  const deflators = new Float64Array(months + 1)
  deflators[0] = 1
  for (let t = 1; t <= months; t++) {
    deflator *= d
    deflators[t] = deflator
  }

  for (let t = 1; t <= months; t++) {
    const c = Number(contributionCents[t - 1] as Cents)
    for (let p = 0; p < paths; p++) {
      const z = rng.nextNormal()
      const factor = detExp(drift + sigmaM * z) * f
      const grown = ((balances[p] as number) + c) * factor
      // inline round-half-to-even quantization (hot path)
      const fl = Math.floor(grown)
      const frac = grown - fl
      balances[p] = frac > 0.5 ? fl + 1 : frac < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1
    }
    if (s < nSamples && sampleIdx[s] === t) {
      ;(samples[s] as Float64Array).set(balances)
      s++
    }
  }

  const percentileCents: Cents[][] = PERCENTILES.map(() => [])
  const percentileRealCents: Cents[][] = PERCENTILES.map(() => [])
  for (let j = 0; j < nSamples; j++) {
    const sorted = (samples[j] as Float64Array).slice().sort()
    const t = sampleIdx[j] as number
    for (let i = 0; i < PERCENTILES.length; i++) {
      const v = percentileNearestRank(sorted, PERCENTILES[i] as number)
      ;(percentileCents[i] as Cents[]).push(BigInt(v))
      ;(percentileRealCents[i] as Cents[]).push(roundHalfToEven(v / (deflators[t] as number)))
    }
  }

  return {
    schemaVersion: 1,
    seed,
    paths,
    months,
    startAgeMonths,
    sampleAgesMonths: sampleIdx.map((t) => startAgeMonths + t),
    percentileCents,
    percentileRealCents,
  }
}
