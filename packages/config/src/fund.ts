export interface FundInfo {
  ticker: string
  name: string
  expenseRatio: number
  trackerUrl: string
  /** Issuer's site, where the authoritative expense ratio / prospectus lives. */
  issuerUrl: string
  isDefault: boolean
}

/** Date the expense ratios below were last checked against issuer materials. */
export const EXPENSE_RATIOS_AS_OF = '2026-08-01'

/** Statute requires low-cost index funds tracking primarily U.S. companies, with capped fees. */
export const FUNDS: readonly FundInfo[] = [
  {
    ticker: 'SPYM',
    name: 'State Street SPDR Portfolio S&P 500 ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/SPYM',
    issuerUrl: 'https://www.ssga.com',
    isDefault: true,
  },
  {
    ticker: 'IVV',
    name: 'iShares Core S&P 500 ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/IVV',
    issuerUrl: 'https://www.ishares.com',
    isDefault: false,
  },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/VTI',
    issuerUrl: 'https://investor.vanguard.com',
    isDefault: false,
  },
  {
    ticker: 'SPTM',
    name: 'SPDR Portfolio S&P 1500 Composite Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/SPTM',
    issuerUrl: 'https://www.ssga.com',
    isDefault: false,
  },
  {
    ticker: 'ITOT',
    name: 'iShares Core S&P Total U.S. Stock Market ETF',
    expenseRatio: 0.0003,
    trackerUrl: 'https://finance.yahoo.com/quote/ITOT',
    issuerUrl: 'https://www.ishares.com',
    isDefault: false,
  },
] as const

export const DEFAULT_FUND: FundInfo = FUNDS.find((f) => f.isDefault) ?? (FUNDS[0] as FundInfo)
