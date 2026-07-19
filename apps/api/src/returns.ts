import { FUNDS } from '@530a/config'

/**
 * Live trailing returns for the eligible funds (§ Advanced Model presets).
 * Source: Yahoo Finance chart API, monthly dividend-adjusted closes — public
 * data, no auth. Returns are NOMINAL annualized (CAGR); the client converts
 * to after-inflation terms with the user's own inflation assumption.
 */

export const PERIOD_MONTHS = { '1y': 12, '5y': 60, '10y': 120 } as const
export type Period = keyof typeof PERIOD_MONTHS

export type FundReturns = Record<Period, number | null>

/**
 * Annualized return over the trailing `months`, from a monthly adjusted-close
 * series (oldest first). Null when the series is too short or endpoints are
 * missing — the UI disables that period rather than guessing.
 */
export function computeCagr(adjclose: readonly (number | null)[], months: number): number | null {
  const last = adjclose[adjclose.length - 1]
  const first = adjclose[adjclose.length - 1 - months]
  if (last == null || first == null || first <= 0 || last <= 0) return null
  const years = months / 12
  const cagr = (last / first) ** (1 / years) - 1
  return Math.round(cagr * 10_000) / 10_000
}

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: { adjclose?: Array<{ adjclose?: (number | null)[] }> }
    }>
  }
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

async function fetchSeries(
  ticker: string,
  fetchImpl: typeof fetch,
): Promise<(number | null)[] | null> {
  try {
    const res = await fetchImpl(
      `${YAHOO}/${encodeURIComponent(ticker)}?range=11y&interval=1mo&events=div`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (530amodel.com fund-return presets)' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as YahooChart
    return data.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ?? null
  } catch {
    return null
  }
}

export interface ReturnsPayload {
  asOf: string
  source: string
  note: string
  funds: Record<string, FundReturns>
}

/** Fetch and compute trailing returns for every eligible fund. */
export async function buildReturnsPayload(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<ReturnsPayload> {
  const funds: Record<string, FundReturns> = {}
  await Promise.all(
    FUNDS.map(async (f) => {
      const series = await fetchSeries(f.ticker, fetchImpl)
      funds[f.ticker] = {
        '1y': series ? computeCagr(series, PERIOD_MONTHS['1y']) : null,
        '5y': series ? computeCagr(series, PERIOD_MONTHS['5y']) : null,
        '10y': series ? computeCagr(series, PERIOD_MONTHS['10y']) : null,
      }
    }),
  )
  return {
    asOf: now.toISOString().slice(0, 10),
    source: 'Yahoo Finance monthly adjusted close (dividends reinvested)',
    note: 'Nominal annualized returns (CAGR). Past performance does not predict future results.',
    funds,
  }
}
