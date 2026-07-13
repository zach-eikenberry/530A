import { describe, expect, it } from 'vitest'
import { monteCarlo } from '../src/montecarlo'
import { baseScenario } from './helpers'

/**
 * Performance smoke test for the §10.3 budget (< 150 ms typical on a
 * mid-range phone for the default 5,000 paths). CI machines vary wildly,
 * so the hard gate here is loose; the number is logged so regressions are
 * visible in CI output. The real-device budget is enforced by Lighthouse/E2E.
 */
describe('monte carlo performance', () => {
  it('5,000 paths to age 72 stays within the CI smoke budget', () => {
    const s = baseScenario({ targetAgeMonths: 72 * 12 })
    monteCarlo(s, 1, 200) // warmup / JIT
    const t0 = performance.now()
    monteCarlo(s, 42, 5000)
    // ~440 ms native on an M-series laptop; ~4.3 s on a shared CI runner with
    // coverage instrumentation. The bound only catches order-of-magnitude
    // regressions — real budgets are enforced on-device by Lighthouse/E2E.
    const elapsed = performance.now() - t0
    expect(elapsed, `monteCarlo 5000 paths took ${elapsed.toFixed(0)} ms`).toBeLessThan(15_000)
  })
})
