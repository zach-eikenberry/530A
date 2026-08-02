/**
 * Map engine validation errors (RangeErrors from @530a/engine schedule.ts /
 * money.ts) to human-readable messages tied to the editor field that caused
 * them, so the model page can point at the offending input instead of
 * echoing internal identifiers like "targetAgeMonths".
 */

export interface EngineErrorInfo {
  message: string
  /** DOM id of the offending input, when one exists on the model page. */
  fieldId?: string
}

const MAPPINGS: { match: RegExp; info: EngineErrorInfo }[] = [
  {
    match: /targetAgeMonths must exceed the child age/,
    info: {
      message: "“Project to age” must be greater than the child's current age.",
      fieldId: 'target-age-range',
    },
  },
  {
    match: /targetAgeMonths must be an integer/,
    info: { message: '“Project to age” must be between 1 and 119.', fieldId: 'target-age-range' },
  },
  {
    match: /annualReturn must exceed/,
    info: { message: 'Annual return must be greater than −100%.', fieldId: 'adv-return' },
  },
  {
    match: /annualInflation must exceed/,
    info: { message: 'Inflation must be greater than −100%.', fieldId: 'adv-inflation' },
  },
  {
    match: /annualFee must be in/,
    info: { message: 'Fund fee must be between 0% and 100%.', fieldId: 'adv-fee' },
  },
  {
    match: /negative contribution/,
    info: { message: "Contribution amounts can't be negative." },
  },
  {
    match: /asOf precedes birth date/,
    info: { message: "The child's birth date can't be in the future." },
  },
  {
    match: /non-finite|invalid dollar amount/,
    info: { message: 'One of the number fields is empty or not a number — check your inputs.' },
  },
]

export function engineErrorInfo(e: unknown): EngineErrorInfo {
  const raw = e instanceof Error ? e.message : String(e)
  for (const { match, info } of MAPPINGS) {
    if (match.test(raw)) return info
  }
  return { message: `That scenario could not be computed: ${raw}` }
}
