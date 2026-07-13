import { describe, expect, it } from 'vitest'
import { Xoshiro128StarStar } from '../src/prng'

describe('Xoshiro128StarStar', () => {
  it('is deterministic: same seed → identical sequence', () => {
    const a = new Xoshiro128StarStar(42)
    const b = new Xoshiro128StarStar(42)
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32())
    }
    const c = new Xoshiro128StarStar(42)
    const d = new Xoshiro128StarStar(42)
    for (let i = 0; i < 100; i++) {
      expect(c.nextNormal()).toBe(d.nextNormal())
    }
  })

  it('different seeds diverge', () => {
    const a = new Xoshiro128StarStar(1)
    const b = new Xoshiro128StarStar(2)
    const seqA = Array.from({ length: 10 }, () => a.nextUint32())
    const seqB = Array.from({ length: 10 }, () => b.nextUint32())
    expect(seqA).not.toEqual(seqB)
  })

  it('rejects invalid seeds', () => {
    expect(() => new Xoshiro128StarStar(-1)).toThrow(RangeError)
    expect(() => new Xoshiro128StarStar(2 ** 32)).toThrow(RangeError)
    expect(() => new Xoshiro128StarStar(1.5)).toThrow(RangeError)
  })

  it('uniform53 lies in [0,1) with mean ≈ 1/2 and variance ≈ 1/12', () => {
    const rng = new Xoshiro128StarStar(7)
    const n = 50_000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const u = rng.nextUniform53()
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
      sum += u
      sumSq += u * u
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.005)
    expect(Math.abs(variance - 1 / 12)).toBeLessThan(0.005)
  })

  it('normals have mean ≈ 0, variance ≈ 1, skew ≈ 0, kurtosis ≈ 3', () => {
    const rng = new Xoshiro128StarStar(1234)
    const n = 100_000
    let m1 = 0
    let m2 = 0
    let m3 = 0
    let m4 = 0
    for (let i = 0; i < n; i++) {
      const z = rng.nextNormal()
      m1 += z
      m2 += z * z
      m3 += z * z * z
      m4 += z * z * z * z
    }
    m1 /= n
    m2 /= n
    m3 /= n
    m4 /= n
    expect(Math.abs(m1)).toBeLessThan(0.02)
    expect(Math.abs(m2 - 1)).toBeLessThan(0.02)
    expect(Math.abs(m3)).toBeLessThan(0.05)
    expect(Math.abs(m4 - 3)).toBeLessThan(0.15)
  })
})
