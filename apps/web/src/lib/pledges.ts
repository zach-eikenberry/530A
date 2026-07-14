import { DEFAULTS } from '@530a/config'
import { encodeState } from '@530a/engine'

/**
 * Pledges feed loader (§7, §10.1): fetched ONCE at build time so the page
 * ships as static HTML — never read-per-request. The ingest cron pings a
 * deploy hook when items change, regenerating the page.
 */

export interface PledgeItem {
  id: number
  title: string
  excerpt: string
  source_url: string
  source_domain: string
  tier: 'A' | 'B'
  amount_cents: number | null
  recurring: number
  qualifies_note: string | null
  birth_year_start: number | null
  birth_year_end: number | null
  published_at: string
}

export interface PledgesFeed {
  items: PledgeItem[]
  generatedAt: string | null
  /** Where the items came from — shown so demo data can never pass as real. */
  source: 'live' | 'fixture' | 'empty'
}

export async function loadPledges(): Promise<PledgesFeed> {
  const feedUrl = import.meta.env.PLEDGES_FEED_URL as string | undefined
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl)
      if (res.ok) {
        const data = (await res.json()) as { items: PledgeItem[]; generatedAt: string }
        return { items: data.items, generatedAt: data.generatedAt, source: 'live' }
      }
    } catch {
      /* fall through to empty — a build must never fail because the feed is down */
    }
    return { items: [], generatedAt: null, source: 'empty' }
  }
  // Test/dev builds only: deterministic fixture, clearly labeled in the UI.
  if (import.meta.env.PLEDGES_ALLOW_FIXTURE === '1' || import.meta.env.DEV) {
    const fixture = await import('../data/pledges.fixture.json')
    return { items: fixture.default.items as PledgeItem[], generatedAt: null, source: 'fixture' }
  }
  return { items: [], generatedAt: null, source: 'empty' }
}

/**
 * UC-6 handoff: a human-approved Tier-B pledge becomes a prefilled scenario.
 * The gift lands as a one-time charity contribution for a child born in the
 * qualifying window (defaults to the window's first year; the visitor
 * adjusts the birth year on the model page to match their child).
 */
export function modelLinkFor(item: PledgeItem, asOfIso: string): string | null {
  if (item.tier !== 'B' || !item.amount_cents || !item.birth_year_start) return null
  const birthYear = Math.min(Math.max(item.birth_year_start, 2020), 2028)
  const state = {
    asOf: asOfIso,
    child: { birthDate: `${birthYear}-01-15` },
    includeSeed: true,
    sources: [
      {
        id: `pledge-${item.id}`,
        kind: 'charity' as const,
        schedule: {
          type: 'once' as const,
          amountCents: BigInt(item.amount_cents),
          atAgeMonths: 0, // clamped to "now" by the engine-side editor on load
        },
      },
    ],
    assumptions: {
      annualReturn: DEFAULTS.annualRealReturn,
      returnIsReal: true,
      annualInflation: 0.025,
      annualFee: DEFAULTS.annualFee,
      annualVolatility: 0.15,
    },
    targetAgeMonths: DEFAULTS.targetAge * 12,
    mcSeed: 530,
    mcPaths: DEFAULTS.monteCarlo.defaultPaths,
  }
  try {
    return `/model?s=${encodeState(state)}`
  } catch {
    return null
  }
}
