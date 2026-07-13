import {
  decodeState,
  estimateRothConversion,
  estimateTraditional,
  formatMoney,
  type MonteCarloResult,
  project,
  type ScenarioState,
} from '@530a/engine'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { magnitudeBucket, track } from '../lib/analytics'
import {
  defaultEditorState,
  type EditorState,
  fromScenarioState,
  newSourceId,
  PERSONA_COPY,
  type Persona,
  toScenarioState,
  VOL_PRESETS,
} from '../lib/editor'
import { cancelBefore, type McRun, runMonteCarlo, SUPERSEDED } from '../lib/mc-client'
import { toScenario } from '../lib/scenario'
import FanChart from './FanChart'
import SourcesEditor from './SourcesEditor'
import Walkthrough from './Walkthrough'

interface SavedScenario {
  label: string
  state: ScenarioState
  run: McRun
}

function pctAt(mc: MonteCarloResult, ageYears: number, row: number, real: boolean): bigint | null {
  const idx = mc.sampleAgesMonths.indexOf(ageYears * 12)
  if (idx < 0) return null
  const rows = real ? mc.percentileRealCents : mc.percentileCents
  return (rows[row] as bigint[])[idx] ?? null
}

export default function AdvancedModel() {
  const asOf = useMemo(() => new Date(), [])
  const [editor, setEditor] = useState<EditorState>(() => defaultEditorState(asOf))
  const [persona, setPersona] = useState<Persona>('parents')
  const [run, setRun] = useState<McRun | null>(null)
  const [computing, setComputing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedScenario[]>([])
  const [copied, setCopied] = useState(false)
  // Charity cohort panel
  const [cohortSize, setCohortSize] = useState(100)
  const [cohortBudget, setCohortBudget] = useState(100_000)

  const state = useMemo(() => toScenarioState(editor, asOf), [editor, asOf])
  const encoded = useMemo(() => {
    try {
      return encodeStateSafe(state)
    } catch {
      return null
    }
  }, [state])

  // Restore from ?s= (and comparison scenarios from ?s2=, ?s3=) on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('s')
    if (s) {
      try {
        setEditor(fromScenarioState(decodeState(s), asOf))
      } catch {
        setError('That shared link could not be read; starting fresh.')
      }
    }
    for (const key of ['s2', 's3']) {
      const extra = params.get(key)
      if (!extra) continue
      try {
        const st = decodeState(extra)
        runMonteCarlo(st).result.then((r) =>
          setSaved((prev) =>
            prev.length < 3
              ? [...prev, { label: `Scenario ${prev.length + 2}`, state: st, run: r }]
              : prev,
          ),
        )
      } catch {
        // ignore malformed extras
      }
    }
  }, [asOf])

  // Debounced Monte-Carlo run + URL sync on every editor change
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    setComputing(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      const { id, result } = runMonteCarlo(state)
      cancelBefore(id)
      result
        .then((r) => {
          setRun(r)
          setComputing(false)
          setError(null)
          if (encoded) {
            const url = new URL(window.location.href)
            url.searchParams.set('s', encoded)
            history.replaceState(null, '', url)
          }
          const median = pctAt(r.mc, Math.round(state.targetAgeMonths / 12), 2, true)
          if (median !== null) track('scenario_modeled', magnitudeBucket(Number(median) / 100))
        })
        .catch((e: Error) => {
          if (e.message === SUPERSEDED) return
          setComputing(false)
          setError(e.message)
        })
    }, 180)
    return () => clearTimeout(debounce.current)
  }, [state, encoded])

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setEditor((prev) => ({ ...prev, [key]: value }))

  const target = editor.targetAgeYears
  const real = editor.realView
  // Render-time filtering against sampleAgesMonths handles out-of-range ages.
  const milestoneAges = [...new Set([18, 36, 72, target])]

  // At-18 tax branch: basis = total contributions (seed is NOT basis)
  const tax = useMemo(() => {
    if (!run) return null
    const at18 = run.projection.milestones.find((m) => m.ageMonths === 216)
    if (!at18) return null
    const scenario18 = { ...toScenario(state), targetAgeMonths: 216 }
    if (run.projection.startAgeMonths >= 216) return null
    const p18 = project(scenario18)
    const rate = editor.taxRatePct / 100
    const atTarget = run.projection.milestones.find((m) => m.ageMonths === target * 12)
    if (!atTarget) return null
    if (editor.at18Path === 'convert-roth') {
      return estimateRothConversion(at18.nominalCents, p18.breakdown.contributedCents, rate)
    }
    return estimateTraditional(
      atTarget.nominalCents,
      run.projection.breakdown.contributedCents,
      rate,
    )
  }, [run, state, editor.taxRatePct, editor.at18Path, target])

  const saveCurrent = () => {
    if (!run || saved.length >= 3) return
    setSaved((prev) => [...prev, { label: `Scenario ${prev.length + 1}`, state, run }])
    track('scenario_saved')
  }

  const copyLink = async () => {
    if (!encoded) return
    const url = new URL(window.location.href)
    url.searchParams.set('s', encoded)
    saved.slice(0, 2).forEach((sv, i) => {
      try {
        url.searchParams.set(`s${i + 2}`, encodeStateSafe(sv.state) ?? '')
      } catch {
        /* skip */
      }
    })
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    track('link_copied')
  }

  const perChildBudget = cohortSize > 0 ? Math.floor(cohortBudget / cohortSize) : 0

  return (
    <div style="display: grid; gap: 1.25rem;">
      <Walkthrough />

      {/* Persona tabs */}
      <div
        role="tablist"
        aria-label="Who are you modeling as?"
        style="display: flex; gap: 0.5rem; flex-wrap: wrap;"
      >
        {(Object.keys(PERSONA_COPY) as Persona[]).map((p) => (
          <button
            type="button"
            key={p}
            role="tab"
            aria-selected={persona === p}
            class={persona === p ? 'btn' : 'card'}
            style="padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.9rem; border-radius: 999px;"
            onClick={() => setPersona(p)}
          >
            {PERSONA_COPY[p].title}
          </button>
        ))}
      </div>
      <p class="muted" style="margin: 0;">
        {PERSONA_COPY[persona].blurb}
      </p>

      {persona === 'parents' && (
        <div
          style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;"
          data-tour="affordability"
        >
          <span class="muted">Quick set:</span>
          {[25, 100, 250].map((amt) => (
            <button
              type="button"
              key={amt}
              class="card"
              style="cursor: pointer; padding: 0.3rem 0.8rem;"
              data-testid={`quick-${amt}`}
              onClick={() =>
                setEditor((prev) => ({
                  ...prev,
                  sources: prev.sources.map((s, i) =>
                    i === 0 && s.scheduleType === 'monthly' ? { ...s, amountDollars: amt } : s,
                  ),
                }))
              }
            >
              ${amt}/mo
            </button>
          ))}
        </div>
      )}

      {persona === 'charity' && (
        <div class="card" style="display: grid; gap: 0.6rem;" data-testid="cohort-panel">
          <strong>Cohort sizing</strong>
          <label style="display: flex; justify-content: space-between; gap: 1rem;">
            <span>Children in program</span>
            <input
              type="number"
              min={1}
              max={1_000_000}
              value={cohortSize}
              style="width: 8rem;"
              onInput={(e) =>
                setCohortSize(Math.max(1, Number((e.target as HTMLInputElement).value)))
              }
            />
          </label>
          <label style="display: flex; justify-content: space-between; gap: 1rem;">
            <span>Total program budget ($)</span>
            <input
              type="number"
              min={0}
              value={cohortBudget}
              style="width: 8rem;"
              onInput={(e) =>
                setCohortBudget(Math.max(0, Number((e.target as HTMLInputElement).value)))
              }
            />
          </label>
          <div class="muted">
            That's <strong>${perChildBudget.toLocaleString()}</strong> per child.{' '}
            <button
              type="button"
              class="card"
              style="cursor: pointer; padding: 0.2rem 0.6rem;"
              data-testid="apply-per-child"
              onClick={() =>
                setEditor((prev) => ({
                  ...prev,
                  sources: [
                    {
                      id: newSourceId(),
                      kind: 'charity',
                      scheduleType: 'once',
                      amountDollars: perChildBudget,
                      startAgeYears: 0,
                      endAgeYears: 18,
                      monthOfYear: 1,
                      atAgeYears: Math.max(0, Math.floor(asOf.getFullYear() - prev.birthYear)),
                      stepUpPct: 0,
                    },
                  ],
                }))
              }
            >
              Model this per-child gift
            </button>{' '}
            The projection below is per child; multiply by {cohortSize.toLocaleString()} for the
            program total.
          </div>
        </div>
      )}

      {/* Child & timeline */}
      <div class="card" style="display: grid; gap: 0.75rem;" data-tour="child">
        <strong>Child</strong>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <label>
            Born{' '}
            <select
              value={editor.birthYear}
              data-testid="birth-year"
              onInput={(e) => set('birthYear', Number((e.target as HTMLSelectElement).value))}
            >
              {Array.from({ length: asOf.getFullYear() - 2007 }, (_, i) => 2008 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y >= 2025 && y <= 2028 ? ' (seed-eligible)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label style="display: flex; gap: 0.4rem; align-items: center;">
            <input
              type="checkbox"
              checked={editor.includeSeed}
              onChange={(e) => set('includeSeed', (e.target as HTMLInputElement).checked)}
            />
            $1,000 federal seed
          </label>
        </div>
        <label for="target-age-range" style="display: flex; justify-content: space-between;">
          <span>Project to age</span>
          <strong data-testid="target-age">{target}</strong>
        </label>
        <input
          id="target-age-range"
          type="range"
          min={Math.max(1, asOf.getFullYear() - editor.birthYear + 1)}
          max={119}
          value={target}
          data-testid="target-age-slider"
          onInput={(e) => set('targetAgeYears', Number((e.target as HTMLInputElement).value))}
        />
        {target > 90 && (
          <p class="muted" style="margin: 0;">
            Projections past ~age 90 are illustrative — a century of compounding assumptions
            stretches any model.
          </p>
        )}
      </div>

      {/* Contribution sources */}
      <div data-tour="sources">
        <SourcesEditor sources={editor.sources} onChange={(sources) => set('sources', sources)} />
      </div>

      {/* Assumptions */}
      <div class="card" style="display: grid; gap: 0.75rem;" data-tour="assumptions">
        <strong>Assumptions</strong>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem;">
          <label>
            Annual return (after inflation) %
            <input
              type="number"
              step={0.5}
              min={-10}
              max={15}
              value={editor.returnPct}
              style="width: 100%;"
              data-testid="return-input"
              onInput={(e) => set('returnPct', Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <label>
            Inflation %
            <input
              type="number"
              step={0.1}
              min={0}
              max={15}
              value={editor.inflationPct}
              style="width: 100%;"
              onInput={(e) => set('inflationPct', Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <label>
            Fund fee %
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={editor.feePct}
              style="width: 100%;"
              onInput={(e) => set('feePct', Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <label>
            Market volatility
            <select
              value={editor.volPreset}
              style="width: 100%;"
              data-testid="vol-preset"
              onInput={(e) =>
                set('volPreset', (e.target as HTMLSelectElement).value as EditorState['volPreset'])
              }
            >
              <option value="low">Low ({VOL_PRESETS.low * 100}%)</option>
              <option value="med">Medium ({VOL_PRESETS.med * 100}%)</option>
              <option value="high">High ({VOL_PRESETS.high * 100}%)</option>
            </select>
          </label>
        </div>
        <div style="display: flex; gap: 1.25rem; flex-wrap: wrap;">
          <label style="display: flex; gap: 0.4rem; align-items: center;">
            <input
              type="checkbox"
              checked={editor.showRange}
              data-testid="range-toggle"
              onChange={(e) => set('showRange', (e.target as HTMLInputElement).checked)}
            />
            Show range
          </label>
          <label style="display: flex; gap: 0.4rem; align-items: center;">
            <input
              type="checkbox"
              checked={editor.realView}
              data-testid="real-toggle"
              onChange={(e) => set('realView', (e.target as HTMLInputElement).checked)}
            />
            Today's dollars
          </label>
          <label style="display: flex; gap: 0.4rem; align-items: center;">
            <input
              type="checkbox"
              checked={editor.includeFees}
              onChange={(e) => set('includeFees', (e.target as HTMLInputElement).checked)}
            />
            Include fees
          </label>
          <label style="display: flex; gap: 0.4rem; align-items: center;">
            <input
              type="checkbox"
              checked={editor.includeEmployer}
              onChange={(e) => set('includeEmployer', (e.target as HTMLInputElement).checked)}
            />
            Include employer sources
          </label>
        </div>
      </div>

      {/* Results */}
      <div class="card" aria-live="polite" data-tour="results">
        {error && (
          <p role="alert" style="color: var(--error);">
            {error}
          </p>
        )}
        {computing && !run && <p class="muted">Simulating 5,000 market paths…</p>}
        {run && (
          <div style={computing ? 'opacity: 0.55;' : ''}>
            <h2 style="margin-top: 0;" data-testid="headline">
              At {target}:{' '}
              <span style="color: var(--growth-green);">
                {formatCents(pctAt(run.mc, target, 2, real))}
              </span>{' '}
              <span class="muted" style="font-size: 1rem; font-weight: 400;">
                median
                {editor.showRange
                  ? ` · range ${formatCents(pctAt(run.mc, target, 0, real))} – ${formatCents(pctAt(run.mc, target, 4, real))}`
                  : ''}
              </span>
            </h2>
            <FanChart mc={run.mc} real={real} showRange={editor.showRange} />
            <p class="muted">
              In about 90% of the 5,000 simulated markets, the balance at {target} is at least{' '}
              <strong>{formatCents(pctAt(run.mc, target, 0, real))}</strong>
              {real ? ' in today’s dollars' : ''}. Chart shows the median path
              {editor.showRange ? ' with 25–75% and 10–90% bands' : ''}; age runs along the bottom.
            </p>

            <table data-testid="milestone-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Low (10%)</th>
                  <th>Median</th>
                  <th>High (90%)</th>
                </tr>
              </thead>
              <tbody>
                {milestoneAges
                  .filter((age) => run.mc.sampleAgesMonths.includes(age * 12))
                  .map((age) => (
                    <tr key={age}>
                      <td>{age}</td>
                      <td>{formatCents(pctAt(run.mc, age, 0, real))}</td>
                      <td style="font-weight: 700;">{formatCents(pctAt(run.mc, age, 2, real))}</td>
                      <td>{formatCents(pctAt(run.mc, age, 4, real))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <p class="muted" data-testid="breakdown">
              Where the median comes from: {formatMoney(run.projection.breakdown.contributedCents)}{' '}
              contributed
              {run.projection.breakdown.seedCents > 0n
                ? ` + ${formatMoney(run.projection.breakdown.seedCents)} federal seed`
                : ''}{' '}
              + {formatMoney(run.projection.breakdown.growthCents)} growth (net of fees, expected
              path).
              {run.projection.warnings.length > 0 && (
                <span style="color: var(--warning);">
                  {' '}
                  Some contributions exceed the $5,000/yr cap and were not counted.
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* At 18, what next? */}
      {run && run.projection.startAgeMonths < 216 && tax && (
        <div class="card">
          <strong>At 18, what next?</strong>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin: 0.5rem 0;">
            <label style="display: flex; gap: 0.4rem; align-items: center;">
              <input
                type="radio"
                name="at18"
                checked={editor.at18Path === 'stay-traditional'}
                onChange={() => set('at18Path', 'stay-traditional')}
              />
              Keep as Traditional IRA
            </label>
            <label style="display: flex; gap: 0.4rem; align-items: center;">
              <input
                type="radio"
                name="at18"
                checked={editor.at18Path === 'convert-roth'}
                onChange={() => set('at18Path', 'convert-roth')}
              />
              Convert to Roth at 18
            </label>
            <label>
              Future tax rate %
              <input
                type="number"
                min={0}
                max={60}
                value={editor.taxRatePct}
                style="width: 5rem; margin-left: 0.4rem;"
                onInput={(e) => set('taxRatePct', Number((e.target as HTMLInputElement).value))}
              />
            </label>
          </div>
          <p class="muted" style="margin: 0;">
            {editor.at18Path === 'stay-traditional' ? (
              <>
                Estimated after-tax value at {target} (expected path):{' '}
                <strong>{formatMoney(tax.afterTaxCents)}</strong> — earnings taxed ~
                {formatMoney(tax.taxCents)} at withdrawal; contributions come back tax-free.
              </>
            ) : (
              <>
                Converting at 18 would owe roughly <strong>{formatMoney(tax.taxCents)}</strong> in
                tax then (paid from outside the account); qualified withdrawals afterward are
                tax-free.
              </>
            )}{' '}
            Rolling into a 529 plan is <em>not currently permitted</em> under the statute as far as
            we can verify. All tax figures are estimates.
          </p>
        </div>
      )}

      {/* Compare & share */}
      <div class="card" data-tour="share">
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
          <button
            type="button"
            class="btn"
            style="cursor: pointer;"
            onClick={copyLink}
            data-testid="copy-link"
          >
            {copied ? 'Copied!' : 'Copy share link'}
          </button>
          <button
            type="button"
            class="card"
            style="cursor: pointer;"
            onClick={saveCurrent}
            disabled={!run || saved.length >= 3}
            data-testid="save-scenario"
          >
            + Add to comparison ({saved.length}/3)
          </button>
          <span class="muted">Compare what-ifs, or add each child to see a family total.</span>
        </div>
        {saved.length > 0 && run && (
          <table data-testid="compare-table" style="margin-top: 0.75rem;">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Median at 18</th>
                <th>Median at {target}</th>
              </tr>
            </thead>
            <tbody>
              {[{ label: 'Current', state, run }, ...saved].map((sv) => (
                <tr key={sv.label}>
                  <td>{sv.label}</td>
                  <td>{formatCents(pctAt(sv.run.mc, 18, 2, real))}</td>
                  <td>
                    {formatCents(
                      pctAt(sv.run.mc, Math.round(sv.state.targetAgeMonths / 12), 2, real),
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td style="font-weight: 700;">Combined</td>
                <td style="font-weight: 700;">
                  {formatCents(sumMedians([{ label: 'Current', state, run }, ...saved], 18, real))}
                </td>
                <td style="font-weight: 700;">—</td>
              </tr>
            </tbody>
          </table>
        )}
        {saved.length > 0 && (
          <p class="muted" style="margin-bottom: 0;">
            The combined row adds each scenario's median — a planning aid, not a statistical median
            of the family total.
          </p>
        )}
      </div>
    </div>
  )
}

function formatCents(cents: bigint | null): string {
  return cents === null ? '—' : formatMoney(cents)
}

function sumMedians(
  entries: { state: ScenarioState; run: McRun }[],
  ageYears: number,
  real: boolean,
): bigint | null {
  let total = 0n
  for (const e of entries) {
    const v = pctAt(e.run.mc, ageYears, 2, real)
    if (v === null) return null
    total += v
  }
  return total
}

// Lazy import indirection so the codec stays tree-shaken with the engine
import { encodeState } from '@530a/engine'

function encodeStateSafe(state: ScenarioState): string | null {
  try {
    return encodeState(state)
  } catch {
    return null
  }
}
