/**
 * Seeded, portable PRNG (xoshiro128**) + deterministic standard normals.
 *
 * Everything here is 32-bit integer math and IEEE-754 +,-,*,/,sqrt — all
 * bit-identical across JS engines and mirrored exactly by the Python
 * reference. Normals use the Marsaglia polar method with detLn so no
 * platform libm is involved. The seed is part of the shared `?s=` state,
 * so a shared link reproduces identical percentile bands anywhere.
 */

import { detLn } from './detmath'

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

/** splitmix32 — expands one 32-bit seed into the xoshiro state. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
  }
}

export class Xoshiro128StarStar {
  private s0: number
  private s1: number
  private s2: number
  private s3: number
  private spare: number | null = null

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(`seed must be a uint32, got ${seed}`)
    }
    const sm = splitmix32(seed)
    this.s0 = sm()
    this.s1 = sm()
    this.s2 = sm()
    this.s3 = sm()
    // All-zero state is invalid for xoshiro; splitmix cannot produce it from
    // four consecutive outputs, but guard anyway.
    /* v8 ignore next */
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1
  }

  /** Next uint32. */
  nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 = (this.s2 ^ this.s0) >>> 0
    this.s3 = (this.s3 ^ this.s1) >>> 0
    this.s1 = (this.s1 ^ this.s2) >>> 0
    this.s0 = (this.s0 ^ this.s3) >>> 0
    this.s2 = (this.s2 ^ t) >>> 0
    this.s3 = rotl(this.s3, 11)
    return result
  }

  /** Uniform in [0, 1) with 53 bits of precision (two draws). */
  nextUniform53(): number {
    const hi = this.nextUint32() >>> 5 // 27 bits
    const lo = this.nextUint32() >>> 6 // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992 // (hi·2^26 + lo) / 2^53
  }

  /**
   * Standard normal via Marsaglia polar (deterministic ln/sqrt only).
   * Generates pairs; the second value is cached and returned on the next call.
   */
  nextNormal(): number {
    if (this.spare !== null) {
      const v = this.spare
      this.spare = null
      return v
    }
    for (;;) {
      const u = 2 * this.nextUniform53() - 1
      const v = 2 * this.nextUniform53() - 1
      const s = u * u + v * v
      if (s > 0 && s < 1) {
        const mult = Math.sqrt((-2 * detLn(s)) / s)
        this.spare = v * mult
        return u * mult
      }
    }
  }
}
