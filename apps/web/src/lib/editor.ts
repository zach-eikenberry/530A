import { DEFAULTS } from '@530a/config'
import type { ContributionSource, ScenarioState, SourceKind } from '@530a/engine'

/**
 * Advanced Model editor state (§5.2) — the UI-facing shape. Ages are years
 * and money is whole dollars here; conversion to engine months/cents happens
 * in one place (`toScenarioState`). `fromScenarioState` restores the editor
 * from any shared `?s=` link.
 */

export type VolPreset = 'low' | 'med' | 'high'
export const VOL_PRESETS: Record<VolPreset, number> = { low: 0.1, med: 0.15, high: 0.22 }

export type Persona = 'parents' | 'family' | 'charity' | 'advisor'

export interface EditorSource {
  id: string
  kind: SourceKind
  scheduleType: 'monthly' | 'annual' | 'once'
  amountDollars: number
  startAgeYears: number
  endAgeYears: number
  /** annual schedules: calendar month 1–12 */
  monthOfYear: number
  /** once schedules: age (years) at which the gift lands */
  atAgeYears: number
  stepUpPct: number
}

export interface EditorState {
  birthYear: number
  birthMonth: number
  includeSeed: boolean
  targetAgeYears: number
  volPreset: VolPreset
  showRange: boolean
  /** true = today's dollars, false = nominal */
  realView: boolean
  returnPct: number
  feePct: number
  inflationPct: number
  includeFees: boolean
  includeEmployer: boolean
  taxRatePct: number
  at18Path: 'stay-traditional' | 'convert-roth'
  sources: EditorSource[]
  mcSeed: number
}

let sourceCounter = 1
export function newSourceId(): string {
  return `src-${sourceCounter++}`
}

/**
 * Percent fields hold exactly 2 decimals. Deriving them from decimal rates
 * (0.07 * 100 === 7.000000000000001) leaks float noise into the number
 * inputs, where it breaks value round-trips.
 */
const pct2 = (rate: number): number => Math.round(rate * 100 * 100) / 100

export function defaultEditorState(asOf: Date): EditorState {
  return {
    birthYear: Math.min(asOf.getFullYear(), 2028),
    birthMonth: 1,
    includeSeed: true,
    targetAgeYears: DEFAULTS.targetAge,
    volPreset: 'med',
    showRange: true,
    realView: true,
    returnPct: pct2(DEFAULTS.annualRealReturn),
    feePct: pct2(DEFAULTS.annualFee),
    inflationPct: 2.5,
    includeFees: true,
    includeEmployer: true,
    taxRatePct: 22,
    at18Path: 'stay-traditional',
    sources: [
      {
        id: newSourceId(),
        kind: 'family',
        scheduleType: 'monthly',
        amountDollars: 100,
        startAgeYears: 0,
        endAgeYears: 18,
        monthOfYear: 1,
        atAgeYears: 0,
        stepUpPct: 0,
      },
    ],
    mcSeed: 530,
  }
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toScenarioState(editor: EditorState, asOf: Date): ScenarioState {
  // Child age (months) at asOf: one-time gifts dated in the past clamp to
  // "now" — a $500 gift "at age 0" for a 6-month-old means "today", not
  // "silently never".
  const birth = new Date(editor.birthYear, editor.birthMonth - 1, 15)
  const ageNowMonths = Math.max(
    0,
    (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth()),
  )
  const sources: ContributionSource[] = editor.sources
    .filter((s) => s.amountDollars > 0)
    .filter((s) => editor.includeEmployer || s.kind !== 'employer')
    .map((s) => {
      const amountCents = BigInt(Math.round(s.amountDollars)) * 100n
      const base: ContributionSource = {
        id: s.id,
        kind: s.kind,
        schedule:
          s.scheduleType === 'monthly'
            ? {
                type: 'monthly',
                amountCents,
                startAgeMonths: s.startAgeYears * 12,
                endAgeMonths: s.endAgeYears * 12,
              }
            : s.scheduleType === 'annual'
              ? {
                  type: 'annual',
                  amountCents,
                  monthOfYear: s.monthOfYear,
                  startAgeMonths: s.startAgeYears * 12,
                  endAgeMonths: s.endAgeYears * 12,
                }
              : {
                  type: 'once',
                  amountCents,
                  atAgeMonths: Math.max(s.atAgeYears * 12, ageNowMonths),
                },
      }
      if (s.stepUpPct > 0 && s.scheduleType !== 'once') base.stepUpRate = s.stepUpPct / 100
      return base
    })

  return {
    asOf: isoDate(asOf),
    child: { birthDate: `${editor.birthYear}-${String(editor.birthMonth).padStart(2, '0')}-15` },
    includeSeed: editor.includeSeed,
    sources,
    assumptions: {
      annualReturn: editor.returnPct / 100,
      returnIsReal: true,
      annualInflation: editor.inflationPct / 100,
      annualFee: editor.includeFees ? editor.feePct / 100 : 0,
      annualVolatility: VOL_PRESETS[editor.volPreset],
    },
    targetAgeMonths: editor.targetAgeYears * 12,
    mcSeed: editor.mcSeed,
    mcPaths: DEFAULTS.monteCarlo.defaultPaths,
  }
}

/** Best-effort restore of the editor from a shared state (superset-safe). */
export function fromScenarioState(state: ScenarioState, asOf: Date): EditorState {
  const base = defaultEditorState(asOf)
  const [by, bm] = state.child.birthDate.split('-')
  const vol = state.assumptions.annualVolatility
  const volPreset: VolPreset =
    Math.abs(vol - VOL_PRESETS.low) < 0.025
      ? 'low'
      : Math.abs(vol - VOL_PRESETS.high) < 0.035
        ? 'high'
        : 'med'
  return {
    ...base,
    birthYear: Number(by),
    birthMonth: Number(bm),
    includeSeed: state.includeSeed,
    targetAgeYears: Math.round(state.targetAgeMonths / 12),
    volPreset,
    returnPct: pct2(state.assumptions.annualReturn),
    feePct: pct2(state.assumptions.annualFee || DEFAULTS.annualFee),
    includeFees: state.assumptions.annualFee > 0,
    inflationPct: pct2(state.assumptions.annualInflation),
    mcSeed: state.mcSeed,
    sources: state.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      scheduleType: s.schedule.type,
      amountDollars: Number(s.schedule.amountCents / 100n),
      startAgeYears: s.schedule.type === 'once' ? 0 : Math.round(s.schedule.startAgeMonths / 12),
      endAgeYears: s.schedule.type === 'once' ? 18 : Math.round(s.schedule.endAgeMonths / 12),
      monthOfYear: s.schedule.type === 'annual' ? s.schedule.monthOfYear : 1,
      atAgeYears: s.schedule.type === 'once' ? Math.round(s.schedule.atAgeMonths / 12) : 0,
      stepUpPct: (s.stepUpRate ?? 0) * 100,
    })),
  }
}

export const PERSONA_COPY: Record<Persona, { title: string; blurb: string }> = {
  parents: {
    title: 'For parents',
    blurb:
      'Find a monthly amount that fits your budget and see what it becomes. Even $25 a month — one skipped coffee a week — compounds meaningfully over decades.',
  },
  family: {
    title: 'For grandparents & relatives',
    blurb:
      'Model a one-time gift or a recurring birthday gift and see its long-run impact. A $500 gift today can be worth many times that by adulthood.',
  },
  charity: {
    title: 'For charities & foundations',
    blurb:
      'Size a giving program: pick a per-child amount and cohort size, or work backward from a fixed budget. Note: charitable contributions must go to a "qualified class" of beneficiaries — the precise definition is pending IRS regulations, so confirm program design with counsel.',
  },
  advisor: {
    title: 'For financial advisors',
    blurb:
      'Full control of assumptions for client work. Every figure is deterministic and reproducible from the share link; ranges are seeded Monte-Carlo percentiles, not vibes. Client-ready PDF/Excel exports are coming next.',
  },
}
