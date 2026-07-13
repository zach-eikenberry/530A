import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { decodeState, encodeState, type ScenarioState, StateDecodeError } from '../src/state'
import { baseScenario, monthlySource } from './helpers'

function toState(overrides: Partial<ScenarioState> = {}): ScenarioState {
  const { rules: _rules, schemaVersion: _v, ...rest } = baseScenario()
  return { ...rest, mcSeed: 42, mcPaths: 5000, ...overrides }
}

describe('?s= state codec', () => {
  it('round-trips a full scenario exactly', () => {
    const state = toState({
      sources: [
        monthlySource('parent', 10_000n, { stepUpRate: 0.03 }),
        {
          id: 'grandma',
          kind: 'relative',
          schedule: {
            type: 'annual',
            amountCents: 20_000n,
            monthOfYear: 1,
            startAgeMonths: 0,
            endAgeMonths: 216,
          },
        },
        {
          id: 'gift',
          kind: 'charity',
          schedule: { type: 'once', amountCents: 50_000n, atAgeMonths: 12 },
        },
      ],
    })
    expect(decodeState(encodeState(state))).toEqual(state)
  })

  it('is URL-safe (no characters needing percent-encoding)', () => {
    const encoded = encodeState(toState())
    expect(encoded).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(encodeURIComponent(encoded)).toBe(encoded)
  })

  it('is deterministic: same state → same string', () => {
    expect(encodeState(toState())).toBe(encodeState(toState()))
  })

  it('property: round-trip for arbitrary widget-shaped states', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        fc.integer({ min: 1, max: 119 * 12 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (amount, targetAge, seed) => {
          const state = toState({
            sources: [monthlySource('p', amount)],
            targetAgeMonths: targetAge,
            mcSeed: seed,
          })
          expect(decodeState(encodeState(state))).toEqual(state)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('rejects garbage, wrong versions, and malformed payloads', () => {
    expect(() => decodeState('')).toThrow(StateDecodeError)
    expect(() => decodeState('nodot')).toThrow(StateDecodeError)
    expect(() => decodeState('9.abcd')).toThrow(StateDecodeError)
    expect(() => decodeState('1.!!!not-base64!!!')).toThrow(StateDecodeError)
    expect(() => decodeState(`1.${btoa('{"v":1}')}`)).toThrow(StateDecodeError)
  })

  it('stays compact (a typical scenario fits comfortably in a URL)', () => {
    const encoded = encodeState(toState())
    expect(encoded.length).toBeLessThan(400)
  })
})
