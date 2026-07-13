import { type Cents, roundHalfToEven } from './money'

/**
 * At-18 tax branch (§9.5) — labeled ESTIMATES, never certainties.
 *
 * 530A tax shape (statute): contributions are after-tax BASIS; growth is
 * tax-deferred; earnings (everything above basis, including the federal
 * seed) are taxed as income on withdrawal. Roth conversion taxes the
 * non-basis amount at conversion.
 *
 * The 529 rollover path is NOT modeled here — it is unverified and gated
 * behind config flag `rollover529At18` (off).
 */

export type At18Path = 'stay-traditional' | 'convert-roth'

export interface TaxEstimate {
  path: At18Path
  /** Pre-tax balance the estimate applies to. */
  balanceCents: Cents
  /** After-tax value under the user-supplied future tax rate. */
  afterTaxCents: Cents
  /** Tax paid (at withdrawal for traditional; at conversion for Roth). */
  taxCents: Cents
  assumptions: { taxRate: number; note: string }
}

/**
 * Traditional path: hold to withdrawal; earnings taxed then.
 * afterTax = basis + (balance − basis) · (1 − rate)
 */
export function estimateTraditional(
  balanceCents: Cents,
  basisCents: Cents,
  taxRate: number,
): TaxEstimate {
  validateInputs(balanceCents, basisCents, taxRate)
  const earnings = balanceCents - basisCents
  const tax = earnings > 0n ? roundHalfToEven(Number(earnings) * taxRate) : 0n
  return {
    path: 'stay-traditional',
    balanceCents,
    afterTaxCents: balanceCents - tax,
    taxCents: tax,
    assumptions: {
      taxRate,
      note: 'Earnings (including the federal seed) taxed as income at withdrawal; basis returns tax-free. Estimate only.',
    },
  }
}

/**
 * Roth-conversion-at-18 path: the non-basis amount is taxed at conversion
 * (assumed paid from outside the account, so the full balance keeps
 * compounding tax-free afterwards).
 */
export function estimateRothConversion(
  balanceAt18Cents: Cents,
  basisCents: Cents,
  conversionTaxRate: number,
): TaxEstimate {
  validateInputs(balanceAt18Cents, basisCents, conversionTaxRate)
  const earnings = balanceAt18Cents - basisCents
  const tax = earnings > 0n ? roundHalfToEven(Number(earnings) * conversionTaxRate) : 0n
  return {
    path: 'convert-roth',
    balanceCents: balanceAt18Cents,
    afterTaxCents: balanceAt18Cents,
    taxCents: tax,
    assumptions: {
      taxRate: conversionTaxRate,
      note: 'Conversion tax on non-basis amount assumed paid from outside the account; qualified withdrawals then tax-free. Estimate only.',
    },
  }
}

function validateInputs(balance: Cents, basis: Cents, rate: number): void {
  if (balance < 0n) throw new RangeError('balance must be non-negative')
  if (basis < 0n || basis > balance) throw new RangeError('basis must be in [0, balance]')
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
    throw new RangeError('tax rate must be in [0, 1)')
  }
}
