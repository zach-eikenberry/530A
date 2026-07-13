import { describe, expect, it } from 'vitest'
import { estimateRothConversion, estimateTraditional } from '../src/tax'

describe('estimateTraditional', () => {
  it('taxes only earnings; basis returns tax-free', () => {
    // $50k balance, $30k basis, 22% rate → tax = $4,400
    const e = estimateTraditional(5_000_000n, 3_000_000n, 0.22)
    expect(e.taxCents).toBe(440_000n)
    expect(e.afterTaxCents).toBe(4_560_000n)
  })

  it('zero earnings → zero tax', () => {
    const e = estimateTraditional(1_000_000n, 1_000_000n, 0.35)
    expect(e.taxCents).toBe(0n)
    expect(e.afterTaxCents).toBe(1_000_000n)
  })

  it('validates inputs', () => {
    expect(() => estimateTraditional(-1n, 0n, 0.2)).toThrow(RangeError)
    expect(() => estimateTraditional(100n, 200n, 0.2)).toThrow(RangeError)
    expect(() => estimateTraditional(100n, 50n, 1)).toThrow(RangeError)
    expect(() => estimateTraditional(100n, 50n, -0.1)).toThrow(RangeError)
  })
})

describe('estimateRothConversion', () => {
  it('taxes the non-basis amount at conversion; balance stays intact', () => {
    const e = estimateRothConversion(2_000_000n, 1_500_000n, 0.12)
    expect(e.taxCents).toBe(60_000n)
    expect(e.afterTaxCents).toBe(2_000_000n) // paid from outside the account
  })
})
