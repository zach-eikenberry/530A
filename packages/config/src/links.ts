/** Canonical links shown in Resources, footer, and exports. */
export const CANONICAL_LINKS = {
  statute: 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section530A',
  crsOverview: 'https://www.congress.gov/crs-product/R48910',
  irsNotice: 'https://www.irs.gov/pub/irs-drop/n-25-68.pdf',
  secExplainer:
    'https://www.investor.gov/introduction-investing/investing-basics/investment-accounts/tax-advantaged-accounts/trump-accounts',
  fundTracker: 'https://finance.yahoo.com/quote/SPYM',
  openAccount: 'https://trumpaccounts.gov',
  irsForm: 'IRS Form 4547',
} as const

/** The single canonical host. All alternate domains 301 to this. */
export const CANONICAL_ORIGIN = 'https://530amodel.com'

/**
 * Alternate/defensive domains that Bulk-Redirect to CANONICAL_ORIGIN.
 * Config-driven so newly purchased domains are added here, not in code.
 */
export const REDIRECT_DOMAINS: readonly string[] = []
