/**
 * Numeric contract (§9.2 of the brief):
 * - Money is integer cents (`bigint`) everywhere inside the engine.
 * - Growth/return factors are float; every balance is quantized back to
 *   cents after each step using round-half-to-even (banker's rounding).
 * - The engine returns raw cents; display formatting happens in one place
 *   (`formatMoney`), never inside calculations.
 *
 * The Python reference implementation must mirror these exact semantics
 * (float64 multiply, then banker's round) so golden vectors match to the cent.
 */

export type Cents = bigint

/** Largest cent value we can safely round-trip through float64 math. */
export const MAX_SAFE_CENTS: Cents = 9_007_199_254_740_991n // 2^53 - 1

class MoneyRangeError extends RangeError {
  constructor(value: bigint) {
    super(`cent value ${value} exceeds float64-safe range; engine invariant violated`)
  }
}

function assertSafe(cents: Cents): void {
  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) throw new MoneyRangeError(cents)
}

/**
 * Round a float to the nearest integer, ties to even (banker's rounding).
 * This is THE rounding rule for the whole engine.
 */
export function roundHalfToEven(x: number): bigint {
  if (!Number.isFinite(x)) throw new RangeError(`cannot round non-finite value ${x}`)
  const floor = Math.floor(x)
  const frac = x - floor
  let rounded: number
  if (frac > 0.5) rounded = floor + 1
  else if (frac < 0.5) rounded = floor
  else rounded = floor % 2 === 0 ? floor : floor + 1
  return BigInt(rounded)
}

/** Multiply a cent balance by a float factor, quantizing half-to-even. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  assertSafe(cents)
  if (!Number.isFinite(factor))
    throw new RangeError(`cannot multiply by non-finite factor ${factor}`)
  return roundHalfToEven(Number(cents) * factor)
}

/** Convert a dollar amount (possibly fractional) to integer cents. */
export function centsFromDollars(dollars: number): Cents {
  if (!Number.isFinite(dollars)) throw new RangeError(`invalid dollar amount ${dollars}`)
  return roundHalfToEven(dollars * 100)
}

/** Convert cents to a float dollar amount — display/interop only, never math. */
export function dollarsFromCents(cents: Cents): number {
  assertSafe(cents)
  return Number(cents) / 100
}

/** Centralized money formatter. The single place display formatting happens. */
export function formatMoney(cents: Cents, locale = 'en-US', currency = 'USD'): string {
  assertSafe(cents)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100)
}

/** Money formatter with cents shown, for tables/exports that reconcile to the cent. */
export function formatMoneyExact(cents: Cents, locale = 'en-US', currency = 'USD'): string {
  assertSafe(cents)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100)
}
