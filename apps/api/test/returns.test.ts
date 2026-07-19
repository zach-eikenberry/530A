import { FUNDS } from '@530a/config'
import { describe, expect, it } from 'vitest'
import handler from '../src/api'
import { buildReturnsPayload, computeCagr, PERIOD_MONTHS } from '../src/returns'

/** Monthly series growing at a steady rate; oldest first. */
function steadySeries(months: number, monthlyGrowth: number, start = 100): number[] {
  return Array.from({ length: months + 1 }, (_, i) => start * (1 + monthlyGrowth) ** i)
}

function yahooResponse(adjclose: (number | null)[]): Response {
  return new Response(
    JSON.stringify({ chart: { result: [{ indicators: { adjclose: [{ adjclose }] } }] } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('computeCagr', () => {
  it('annualizes a steady monthly growth rate exactly', () => {
    const series = steadySeries(120, 0.01)
    const expected = 1.01 ** 12 - 1
    for (const months of Object.values(PERIOD_MONTHS)) {
      expect(computeCagr(series, months)).toBeCloseTo(expected, 4)
    }
  })

  it('returns null when the series is too short for the period', () => {
    expect(computeCagr(steadySeries(12, 0.01), 60)).toBeNull()
  })

  it('returns null on missing endpoints instead of guessing', () => {
    const series: (number | null)[] = steadySeries(60, 0.01)
    series[series.length - 1] = null
    expect(computeCagr(series, 12)).toBeNull()
  })

  it('handles negative returns', () => {
    const series = steadySeries(12, -0.01)
    expect(computeCagr(series, 12)).toBeCloseTo(0.99 ** 12 - 1, 4)
  })
})

describe('buildReturnsPayload', () => {
  it('computes per-fund periods from fetched series', async () => {
    const fetchImpl = (async () => yahooResponse(steadySeries(132, 0.01))) as typeof fetch
    const payload = await buildReturnsPayload(fetchImpl, new Date('2026-07-19T00:00:00Z'))
    expect(payload.asOf).toBe('2026-07-19')
    for (const f of FUNDS) {
      expect(payload.funds[f.ticker]?.['10y']).toBeCloseTo(1.01 ** 12 - 1, 4)
    }
  })

  it('yields nulls (not a throw) when upstream fails', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as typeof fetch
    const payload = await buildReturnsPayload(fetchImpl)
    for (const f of FUNDS) {
      expect(payload.funds[f.ticker]).toEqual({ '1y': null, '5y': null, '10y': null })
    }
  })
})

describe('GET /v1/returns route', () => {
  it('is served (real upstream may be unreachable in CI: 200 or 503, valid shape)', async () => {
    const res = await handler.fetch(new Request('https://api.example/v1/returns'))
    expect([200, 503]).toContain(res.status)
    const data = (await res.json()) as { funds: Record<string, unknown>; source: string }
    expect(Object.keys(data.funds).sort()).toEqual(FUNDS.map((f) => f.ticker).sort())
    expect(data.source).toMatch(/adjusted close/)
  })
})
