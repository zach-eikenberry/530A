/**
 * Deterministic transcendental math.
 *
 * IEEE-754 guarantees bit-identical results across platforms for +, -, *, /,
 * and sqrt — but NOT for Math.log/Math.exp/Math.pow, which vary by engine and
 * libm. The brief requires `(inputs, seed) → identical output` on every
 * device and an exact-match Python reference, so the engine only uses these
 * software implementations (fixed operation order, fixed term counts) for
 * ln/exp. The Python reference mirrors them operation-for-operation.
 *
 * Accuracy is ~1 ulp relative (≈1e-16), verified against native Math in tests.
 */

const bits = new DataView(new ArrayBuffer(8))

/** ln(2) as the nearest float64 (same bits as the literal 0.6931471805599453). */
export const LN2 = Math.LN2

/** Exact 2^k for integer k in [-1074, 1023] — powers of two are exact floats. */
export function pow2(k: number): number {
  if (!Number.isInteger(k)) throw new RangeError(`pow2 requires integer exponent, got ${k}`)
  let result = 1
  let base = k < 0 ? 0.5 : 2
  let n = Math.abs(k)
  while (n > 0) {
    if (n & 1) result *= base
    base *= base
    n >>>= 1
  }
  return result
}

/**
 * atanh-series coefficients 1/1, 1/3, … 1/31 built by division so the
 * Python reference constructs bit-identical values the same way.
 */
const LN_COEFFS: number[] = []
for (let n = 0; n < 16; n++) LN_COEFFS.push(1 / (2 * n + 1))

/** Deterministic natural log for normal positive finite x. */
export function detLn(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError(`detLn requires x > 0, got ${x}`)
  // Decompose x = m * 2^e with m in [1, 2)
  bits.setFloat64(0, x)
  const rawExp = (bits.getUint32(0) >>> 20) & 0x7ff
  if (rawExp === 0) throw new RangeError(`detLn does not support subnormal ${x}`)
  let e = rawExp - 1023
  let m = x * pow2(-e)
  // Center m around 1 so the series argument stays small: m in [sqrt(1/2), sqrt(2))
  if (m > Math.SQRT2) {
    m *= 0.5
    e += 1
  }
  // ln(m) = 2·atanh(z), z = (m-1)/(m+1); Horner over fixed 16 terms
  const z = (m - 1) / (m + 1)
  const z2 = z * z
  let sum = LN_COEFFS[LN_COEFFS.length - 1] as number
  for (let i = LN_COEFFS.length - 2; i >= 0; i--) sum = sum * z2 + (LN_COEFFS[i] as number)
  return e * LN2 + 2 * z * sum
}

/** Taylor coefficients 1/n! built by successive division (mirrors Python). */
const EXP_COEFFS: number[] = [1]
for (let n = 1; n <= 26; n++) EXP_COEFFS.push((EXP_COEFFS[n - 1] as number) / n)

// Cody–Waite split of ln2 (fdlibm constants): LN2_HI has enough trailing
// zero bits that k·LN2_HI is exact for our k range, keeping r accurate.
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10

/** Deterministic e^x for |x| ≤ 700. */
export function detExp(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) > 700) {
    throw new RangeError(`detExp requires finite |x| <= 700, got ${x}`)
  }
  // Fast path (Monte-Carlo hot loop): |x| < 0.34 guarantees the reduction
  // step below would pick k = 0, so r = x and the result is bit-identical.
  if (x < 0.34 && x > -0.34) {
    let sum = EXP_COEFFS[EXP_COEFFS.length - 1] as number
    for (let i = EXP_COEFFS.length - 2; i >= 0; i--) sum = sum * x + (EXP_COEFFS[i] as number)
    return sum
  }
  // Range-reduce: x = k·ln2 + r, |r| ≤ ln2/2, then e^x = 2^k · e^r
  const k = Math.floor(x / LN2 + 0.5)
  const r = x - k * LN2_HI - k * LN2_LO
  let sum = EXP_COEFFS[EXP_COEFFS.length - 1] as number
  for (let i = EXP_COEFFS.length - 2; i >= 0; i--) sum = sum * r + (EXP_COEFFS[i] as number)
  return sum * pow2(k)
}

/** Deterministic (1 + rate)^(1/12) − 1 style helper: x^(1/n) for x > 0. */
export function detRoot(x: number, n: number): number {
  return detExp(detLn(x) / n)
}
