import { CANONICAL_LINKS, CANONICAL_ORIGIN, RULES_VERIFIED_AT } from '@530a/config'
import {
  buildContributionStream,
  formatMoneyExact,
  type MonteCarloResult,
  type Projection,
  type ScenarioState,
} from '@530a/engine'
import { toScenario as toEngineScenario } from './scenario'

/**
 * Export payload builder (§6): ONE place turns engine output into the rows
 * both the PDF and the Excel render. The export-invariant test asserts these
 * numbers equal the engine's to the cent; the renderers below never compute,
 * only draw.
 */

export interface ExportBranding {
  firmName?: string
  childName?: string
}

export interface MilestoneRow {
  ageYears: number
  lowRealCents: bigint
  medianRealCents: bigint
  highRealCents: bigint
  medianNominalCents: bigint
}

export interface MonthlyRow {
  monthIndex: number
  ageYears: number
  cumulativeContributionCents: bigint
  nominalCents: bigint
  realCents: bigint
}

export interface ExportPayload {
  title: string
  subtitle: string
  generatedOn: string
  shareUrl: string
  headline: {
    targetAgeYears: number
    medianRealCents: bigint
    lowRealCents: bigint
    highRealCents: bigint
  }
  milestones: MilestoneRow[]
  breakdown: { contributedCents: bigint; seedCents: bigint; growthCents: bigint }
  /** Annual snapshots of the deterministic expected path (every 12 months). */
  annual: MonthlyRow[]
  assumptions: [string, string][]
  sources: [string, string][]
  disclaimer: string
  capWarningCount: number
}

function pct(mc: MonteCarloResult, ageYears: number, row: number, real: boolean): bigint | null {
  const idx = mc.sampleAgesMonths.indexOf(ageYears * 12)
  if (idx < 0) return null
  const rows = real ? mc.percentileRealCents : mc.percentileCents
  return (rows[row] as bigint[])[idx] ?? null
}

export const EXPORT_DISCLAIMER =
  'Educational estimates only — not financial, tax, or legal advice. Market projections are ' +
  'probabilistic ranges based on the stated assumptions, not predictions or guarantees. ' +
  'Verify current 530A rules with the primary sources listed before making decisions.'

export function buildExportPayload(
  state: ScenarioState,
  projection: Projection,
  mc: MonteCarloResult,
  shareUrl: string,
  branding: ExportBranding = {},
): ExportPayload {
  const targetAgeYears = Math.round(state.targetAgeMonths / 12)
  const a = state.assumptions

  const milestoneAges = [...new Set([18, 36, 72, targetAgeYears])].sort((x, y) => x - y)
  const milestones: MilestoneRow[] = []
  for (const age of milestoneAges) {
    const low = pct(mc, age, 0, true)
    const median = pct(mc, age, 2, true)
    const high = pct(mc, age, 4, true)
    const nominal = pct(mc, age, 2, false)
    if (low === null || median === null || high === null || nominal === null) continue
    milestones.push({
      ageYears: age,
      lowRealCents: low,
      medianRealCents: median,
      highRealCents: high,
      medianNominalCents: nominal,
    })
  }

  // Annual snapshots with cumulative contributions, recomputed from the same
  // stream the engine used (identical cap logic — shared code path).
  const stream = buildContributionStream(toEngineScenario(state))
  const annual: MonthlyRow[] = []
  let cumulative = 0n
  let streamIdx = 0
  for (let t = 0; t <= projection.months; t++) {
    while (streamIdx < t) {
      cumulative += stream.contributionCents[streamIdx] as bigint
      streamIdx++
    }
    const age = projection.startAgeMonths + t
    if (age % 12 !== 0 && t !== projection.months) continue
    annual.push({
      monthIndex: t,
      ageYears: Math.floor(age / 12),
      cumulativeContributionCents: cumulative,
      nominalCents: projection.nominalCents[t] as bigint,
      realCents: projection.realCents[t] as bigint,
    })
  }

  const headline = {
    targetAgeYears,
    medianRealCents: pct(mc, targetAgeYears, 2, true) ?? 0n,
    lowRealCents: pct(mc, targetAgeYears, 0, true) ?? 0n,
    highRealCents: pct(mc, targetAgeYears, 4, true) ?? 0n,
  }

  const who = branding.childName ? `for ${branding.childName}` : 'scenario'
  return {
    title: `530A projection ${who}`,
    subtitle: branding.firmName
      ? `Prepared by ${branding.firmName} · 530amodel.com`
      : 'Generated at 530amodel.com — free, private, open-source',
    generatedOn: state.asOf,
    shareUrl,
    headline,
    milestones,
    breakdown: projection.breakdown,
    annual,
    assumptions: [
      ['Child born', state.child.birthDate],
      ['Federal seed included', projection.breakdown.seedCents > 0n ? 'Yes ($1,000)' : 'No'],
      [
        'Annual return',
        `${(a.annualReturn * 100).toFixed(2)}% ${a.returnIsReal ? 'real (after inflation)' : 'nominal'}`,
      ],
      ['Inflation', `${(a.annualInflation * 100).toFixed(2)}%`],
      ['Fund fee', `${(a.annualFee * 100).toFixed(3)}%`],
      ['Market volatility (annual std. dev.)', `${(a.annualVolatility * 100).toFixed(0)}%`],
      ['Monte-Carlo paths / seed', `${state.mcPaths.toLocaleString()} / ${state.mcSeed}`],
      ['Compounding', 'Monthly; balances quantized to cents (banker’s rounding)'],
      ['Contribution cap', '$5,000/child/year aggregate; employer up to $2,500 within cap'],
      ['Rules verified as of', RULES_VERIFIED_AT],
    ],
    sources: [
      ['Statute (IRC §530A)', CANONICAL_LINKS.statute],
      ['IRS Notice 2025-68', CANONICAL_LINKS.irsNotice],
      ['CRS overview', CANONICAL_LINKS.crsOverview],
      ['SEC explainer', CANONICAL_LINKS.secExplainer],
      ['Open an account', CANONICAL_LINKS.openAccount],
      ['This calculator', CANONICAL_ORIGIN],
    ],
    disclaimer: EXPORT_DISCLAIMER,
    capWarningCount: projection.warnings.length,
  }
}

/** Shared display formatting for both renderers. */
export function money(cents: bigint): string {
  return formatMoneyExact(cents)
}
