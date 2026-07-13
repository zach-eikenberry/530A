import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { detExp, detLn, detRoot, pow2 } from '../src/detmath'

describe('pow2', () => {
  it('is exact for integer exponents', () => {
    expect(pow2(0)).toBe(1)
    expect(pow2(10)).toBe(1024)
    expect(pow2(-3)).toBe(0.125)
    expect(pow2(52)).toBe(2 ** 52)
    expect(pow2(-52)).toBe(2 ** -52)
  })

  it('rejects non-integer exponents', () => {
    expect(() => pow2(0.5)).toThrow(RangeError)
  })
})

describe('detLn', () => {
  it('matches native Math.log to ~1 ulp across magnitudes', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-200, max: 1e200, noNaN: true }), (x) => {
        const got = detLn(x)
        const want = Math.log(x)
        expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * 1e-15 + 1e-15)
      }),
      { numRuns: 2000 },
    )
  })

  it('is exact at 1', () => {
    expect(detLn(1)).toBe(0)
  })

  it('rejects non-positive and non-finite input', () => {
    expect(() => detLn(0)).toThrow(RangeError)
    expect(() => detLn(-1)).toThrow(RangeError)
    expect(() => detLn(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => detLn(Number.NaN)).toThrow(RangeError)
  })
})

describe('detExp', () => {
  it('matches native Math.exp to ~1 ulp', () => {
    fc.assert(
      fc.property(fc.double({ min: -700, max: 700, noNaN: true }), (x) => {
        const got = detExp(x)
        const want = Math.exp(x)
        expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * 2e-15)
      }),
      { numRuns: 2000 },
    )
  })

  it('is exact at 0', () => {
    expect(detExp(0)).toBe(1)
  })

  it('rejects out-of-range input', () => {
    expect(() => detExp(701)).toThrow(RangeError)
    expect(() => detExp(Number.NaN)).toThrow(RangeError)
  })

  it('round-trips with detLn', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-10, max: 1e10, noNaN: true }), (x) => {
        expect(Math.abs(detExp(detLn(x)) / x - 1)).toBeLessThanOrEqual(1e-14)
      }),
    )
  })
})

describe('detRoot', () => {
  it('computes monthly factors: (1.07)^(1/12)', () => {
    const m = detRoot(1.07, 12)
    expect(Math.abs(m ** 12 - 1.07)).toBeLessThanOrEqual(1e-14)
  })
})
