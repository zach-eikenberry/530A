import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  centsFromDollars,
  dollarsFromCents,
  formatMoney,
  formatMoneyExact,
  MAX_SAFE_CENTS,
  multiplyCents,
  roundHalfToEven,
} from '../src/money'

describe('roundHalfToEven', () => {
  it('rounds ties to the even neighbor', () => {
    expect(roundHalfToEven(0.5)).toBe(0n)
    expect(roundHalfToEven(1.5)).toBe(2n)
    expect(roundHalfToEven(2.5)).toBe(2n)
    expect(roundHalfToEven(3.5)).toBe(4n)
    expect(roundHalfToEven(-0.5)).toBe(0n)
    expect(roundHalfToEven(-1.5)).toBe(-2n)
    expect(roundHalfToEven(-2.5)).toBe(-2n)
  })

  it('rounds non-ties to nearest', () => {
    expect(roundHalfToEven(1.49)).toBe(1n)
    expect(roundHalfToEven(1.51)).toBe(2n)
    expect(roundHalfToEven(-1.49)).toBe(-1n)
    expect(roundHalfToEven(-1.51)).toBe(-2n)
    expect(roundHalfToEven(7)).toBe(7n)
  })

  it('rejects non-finite input', () => {
    expect(() => roundHalfToEven(Number.NaN)).toThrow(RangeError)
    expect(() => roundHalfToEven(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('property: result is within 0.5 of input and integral', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e12, max: 1e12, noNaN: true }), (x) => {
        const r = Number(roundHalfToEven(x))
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.5)
      }),
    )
  })
})

describe('multiplyCents', () => {
  it('identity factor preserves balance exactly', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (cents) => {
        expect(multiplyCents(cents, 1)).toBe(cents)
      }),
    )
  })

  it('zero factor yields zero', () => {
    expect(multiplyCents(123_456n, 0)).toBe(0n)
  })

  it('property: monotone in factor for positive balances', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000n }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (cents, f, delta) => {
          const lo = multiplyCents(cents, f)
          const hi = multiplyCents(cents, f + delta)
          expect(hi >= lo).toBe(true)
        },
      ),
    )
  })

  it('guards the float64-safe range', () => {
    expect(() => multiplyCents(MAX_SAFE_CENTS + 1n, 1)).toThrow(RangeError)
    expect(() => multiplyCents(100n, Number.NaN)).toThrow(RangeError)
  })

  it('applies banker rounding to the product', () => {
    // 5 * 0.5 = 2.5 → rounds to 2 (even), not 3
    expect(multiplyCents(5n, 0.5)).toBe(2n)
    // 7 * 0.5 = 3.5 → rounds to 4 (even)
    expect(multiplyCents(7n, 0.5)).toBe(4n)
  })
})

describe('dollar conversion', () => {
  it('round-trips whole cents', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }), (cents) => {
        expect(centsFromDollars(dollarsFromCents(cents))).toBe(cents)
      }),
    )
  })

  it('handles classic float traps', () => {
    expect(centsFromDollars(0.1)).toBe(10n)
    expect(centsFromDollars(0.29)).toBe(29n)
    expect(centsFromDollars(1.005)).toBe(100n) // 1.005 is stored below 100.5; banker's round → 100
  })

  it('rejects non-finite dollars', () => {
    expect(() => centsFromDollars(Number.NaN)).toThrow(RangeError)
    expect(() => dollarsFromCents(MAX_SAFE_CENTS + 1n)).toThrow(RangeError)
  })
})

describe('formatMoney', () => {
  it('formats whole dollars by default', () => {
    expect(formatMoney(123_456_00n)).toBe('$123,456')
    expect(formatMoney(0n)).toBe('$0')
  })

  it('formats exact cents for reconciling tables', () => {
    expect(formatMoneyExact(123_456_78n)).toBe('$123,456.78')
    expect(formatMoneyExact(5n)).toBe('$0.05')
  })
})
