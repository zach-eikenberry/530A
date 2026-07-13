export interface FundInfo {
  ticker: string
  name: string
  expenseRatio: number
  trackerUrl: string
  isDefault: boolean
}

/** Statute requires a low-cost S&P 500 index fund with capped fees. */
export const FUNDS: readonly FundInfo[] = [
  {
    ticker: 'SPYM',
    name: 'State Street SPDR Portfolio S&P 500 ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/SPYM',
    isDefault: true,
  },
  {
    ticker: 'IVV',
    name: 'iShares Core S&P 500 ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/IVV',
    isDefault: false,
  },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/VTI',
    isDefault: false,
  },
  {
    ticker: 'SPTM',
    name: 'SPDR Portfolio S&P 1500 Composite Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/SPTM',
    isDefault: false,
  },
  {
    ticker: 'ITOT',
    name: 'iShares Core S&P Total U.S. Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/ITOT',
    isDefault: false,
  },
] as const

export const DEFAULT_FUND: FundInfo = FUNDS.find((f) => f.isDefault) ?? (FUNDS[0] as FundInfo)
