/**
 * Feature flags for legally UNVERIFIED items (§4 of the brief).
 * Each stays OFF until the underlying rule is confirmed with a primary
 * source; flipping one requires updating `pendingReason` → a source URL.
 */
export interface UnverifiedFeatureFlag {
  enabled: boolean
  pendingReason: string
  /** Set when verified: primary-source URL + date. */
  verifiedSource?: string
  verifiedAt?: string
}

export const FLAGS = {
  /** 530A → 529 rollover at 18: NOT found in statute; only Traditional/Roth IRA treatment is. */
  rollover529At18: {
    enabled: false,
    pendingReason:
      'Statute only specifies Traditional-IRA treatment at 18 (Roth conversion taxable). UI must show 529 as "not currently permitted".',
  },
  /** Exact early-withdrawal penalty % (assumed 10% IRA-style, pending). */
  earlyWithdrawalPenalty: {
    enabled: false,
    pendingReason: 'Assumed 10% IRA-style; exact 530A figure pending IRS/Treasury confirmation.',
  },
  /** Precise "qualified class" definition for charity/government contributions. */
  qualifiedClassDefinition: {
    enabled: false,
    pendingReason: 'Pending March 2026 proposed regulations; show general note only.',
  },
  /** Post-2027 inflation-indexing mechanics for the $5,000 cap. */
  post2027CapIndexing: {
    enabled: false,
    pendingReason:
      'Cap is indexed after 2027 but the mechanics (rounding, reference index) are unconfirmed; model uses the flat cap plus a labeled estimate.',
  },
} as const satisfies Record<string, UnverifiedFeatureFlag>

export type FlagName = keyof typeof FLAGS
