import { describe, expect, it } from 'vitest'
import {
  ANNUAL_CAP_CENTS,
  CANONICAL_ORIGIN,
  CONTRIBUTION_FLOOR_DATE,
  DEFAULT_FUND,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  FLAGS,
  FUNDS,
  RULES_VERIFIED_AT,
  SEED_BIRTH_WINDOW,
} from '../src/index'

describe('sourced figures', () => {
  it('every figure carries a source URL and verifiedAt date', () => {
    for (const fig of [
      FEDERAL_SEED_CENTS,
      SEED_BIRTH_WINDOW,
      ANNUAL_CAP_CENTS,
      EMPLOYER_CAP_CENTS,
      CONTRIBUTION_FLOOR_DATE,
    ]) {
      expect(fig.source).toMatch(/^https:\/\//)
      expect(fig.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(RULES_VERIFIED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('core dollar figures are correct in cents', () => {
    expect(FEDERAL_SEED_CENTS.value).toBe(100_000n)
    expect(ANNUAL_CAP_CENTS.value).toBe(500_000n)
    expect(EMPLOYER_CAP_CENTS.value).toBe(250_000n)
  })

  it('employer cap fits within the annual cap', () => {
    expect(EMPLOYER_CAP_CENTS.value <= ANNUAL_CAP_CENTS.value).toBe(true)
  })

  it('key dates are consistent', () => {
    expect(SEED_BIRTH_WINDOW.value.start < SEED_BIRTH_WINDOW.value.end).toBe(true)
    expect(CONTRIBUTION_FLOOR_DATE.value).toBe('2026-07-04')
  })
})

describe('unverified feature flags', () => {
  it('all four unverified items exist and default OFF', () => {
    const names = Object.keys(FLAGS)
    expect(names).toHaveLength(4)
    for (const flag of Object.values(FLAGS)) {
      expect(flag.enabled).toBe(false)
      expect(flag.pendingReason.length).toBeGreaterThan(10)
    }
  })
})

describe('fund data', () => {
  it('SPYM is the default fund at 3 bps', () => {
    expect(DEFAULT_FUND.ticker).toBe('SPYM')
    expect(DEFAULT_FUND.expenseRatio).toBe(0.0003)
  })

  it('exactly one default fund', () => {
    expect(FUNDS.filter((f) => f.isDefault)).toHaveLength(1)
  })
})

describe('canonical origin', () => {
  it('is the single https host with no trailing slash', () => {
    expect(CANONICAL_ORIGIN).toBe('https://530amodel.com')
  })
})
