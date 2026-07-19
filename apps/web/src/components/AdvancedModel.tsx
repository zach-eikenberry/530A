import {
  decodeState,
  encodeState,
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
import ExportButtons from './ExportButtons'
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

function encodeStateSafe(state: ScenarioState): string | null {
  try {
    return encodeState(state)
  } catch {
    return null
  }
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

export default function AdvancedModel() {
  const asOf = useMemo(() => new Date(), [])
  const [editor, setEditor] = useState<EditorState>(() => defaultEditorState(asOf))
  const [persona, setPersona] = useState<Persona>('parents')
  const [run, setRun] = useState<McRun | null>(null)
  const [computing, setComputing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedScenario[]>([])
  const [copied, setCopied] = useState(false)
  const [cohortSize, setCohortSize] = useState(100)
  const [cohortBudget, setCohortBudget] = useState(100_000)

  const state = useMemo(() => toScenarioState(editor, asOf), [editor, asOf])
  const encoded = useMemo(() => encodeStateSafe(state), [state])

  // Restore from ?s= (and comparison scenarios from ?s2=, ?s3=) on mount
  useEffect(() => {
    document.getElementById('model-skeleton')?.remove()
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
  const milestoneAges = [...new Set([18, 36, 72, target])]

  // At-18 tax branch: basis = total contributions (seed is NOT basis)
  const tax = useMemo(() => {
    if (!run) return null
    const at18 = run.projection.milestones.find((m) => m.ageMonths === 216)
    if (!at18) return null
    if (run.projection.startAgeMonths >= 216) return null
    // `run` is the last good result but `state` is the live editor value —
    // while they disagree (e.g. mid-edit to an invalid scenario) the engine
    // may reject the projection; hide the panel instead of throwing in render.
    try {
      const scenario18 = { ...toScenario(state), targetAgeMonths: 216 }
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
    } catch {
      return null
    }
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
      const extra = encodeStateSafe(sv.state)
      if (extra) url.searchParams.set(`s${i + 2}`, extra)
    })
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    track('link_copied')
  }

  const perChildBudget = cohortSize > 0 ? Math.floor(cohortBudget / cohortSize) : 0

  return (
    <div class="stack">
      <Walkthrough />

      {/* Persona tabs */}
      <div>
        <div
          class="segmented"
          role="tablist"
          aria-label="Who are you modeling as?"
          style="flex-wrap: wrap;"
        >
          {(Object.keys(PERSONA_COPY) as Persona[]).map((p) => (
            <button
              type="button"
              key={p}
              role="tab"
              aria-selected={persona === p}
              onClick={() => setPersona(p)}
            >
              {PERSONA_COPY[p].title}
            </button>
          ))}
        </div>
        <p class="muted mt-1" style="font-size: 0.92rem;">
          {PERSONA_COPY[persona].blurb}
        </p>
      </div>

      <div class="model-grid">
        {/* ---------- Controls panel ---------- */}
        <aside class="card model-panel">
          {persona === 'parents' && (
            <div class="panel-group" data-tour="affordability">
              <div class="pg-title">Quick set</div>
              <div class="flex gap-2 wrap">
                {[25, 100, 250].map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    class="btn btn-ghost btn-sm"
                    data-testid={`quick-${amt}`}
                    onClick={() =>
                      setEditor((prev) => ({
                        ...prev,
                        sources: prev.sources.map((s, i) =>
                          i === 0 && s.scheduleType === 'monthly'
                            ? { ...s, amountDollars: amt }
                            : s,
                        ),
                      }))
                    }
                  >
                    ${amt}/mo
                  </button>
                ))}
              </div>
            </div>
          )}

          {persona === 'charity' && (
            <div class="panel-group" data-testid="cohort-panel">
              <div class="pg-title">Cohort sizing</div>
              <div class="field">
                <div class="field-row">
                  <span class="field-label">Children in program</span>
                </div>
                <input
                  class="input"
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={cohortSize}
                  onInput={(e) =>
                    setCohortSize(Math.max(1, Number((e.target as HTMLInputElement).value)))
                  }
                />
              </div>
              <div class="field">
                <div class="field-row">
                  <span class="field-label">Total program budget</span>
                </div>
                <div class="input-money">
                  <input
                    class="input"
                    type="number"
                    min={0}
                    value={cohortBudget}
                    onInput={(e) =>
                      setCohortBudget(Math.max(0, Number((e.target as HTMLInputElement).value)))
                    }
                  />
                </div>
              </div>
              <div class="field-hint">
                That's <strong>${perChildBudget.toLocaleString()}</strong> per child.{' '}
                <button
                  type="button"
                  class="btn btn-ghost btn-sm mt-1"
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
                          atAgeYears: Math.max(0, asOf.getFullYear() - prev.birthYear),
                          stepUpPct: 0,
                        },
                      ],
                    }))
                  }
                >
                  Model this per-child gift
                </button>{' '}
                The projection is per child; multiply by {cohortSize.toLocaleString()} for the
                program total.
              </div>
            </div>
          )}

          <div class="panel-group" data-tour="child">
            <div class="pg-title">Child</div>
            <div class="field">
              <div class="field-row">
                <span class="field-label">Born</span>
              </div>
              <select
                class="input"
                value={editor.birthYear}
                aria-label="Child's birth year"
                data-testid="birth-year"
                onInput={(e) => {
                  const birthYear = Number((e.target as HTMLSelectElement).value)
                  // Keep the target age ahead of the child's age, or the
                  // engine (correctly) rejects the scenario.
                  const minTarget = Math.max(1, asOf.getFullYear() - birthYear + 1)
                  setEditor((prev) => ({
                    ...prev,
                    birthYear,
                    targetAgeYears: Math.max(prev.targetAgeYears, minTarget),
                  }))
                }}
              >
                {Array.from({ length: asOf.getFullYear() - 2007 }, (_, i) => 2008 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                    {y >= 2025 && y <= 2028 ? ' (seed-eligible)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <label class="toggle mt-1">
              <input
                type="checkbox"
                checked={editor.includeSeed}
                onChange={(e) => set('includeSeed', (e.target as HTMLInputElement).checked)}
              />
              <span class="track"></span>
              <span class="field-label">$1,000 federal seed</span>
            </label>
            <div class="field mt-2">
              <div class="field-row">
                <label class="field-label" for="target-age-range">
                  Project to age
                </label>
                <span class="field-value" data-testid="target-age">
                  {target}
                </span>
              </div>
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
                <div class="field-hint" style="color: var(--warn);">
                  Projections past ~age 90 are illustrative — a century of compounding assumptions
                  stretches any model.
                </div>
              )}
            </div>
          </div>

          <div class="panel-group" data-tour="sources">
            <SourcesEditor
              sources={editor.sources}
              onChange={(sources) => set('sources', sources)}
            />
          </div>

          <div class="panel-group" data-tour="assumptions">
            <div class="pg-title">Assumptions</div>
            <div class="field">
              <div class="field-row">
                <label class="field-label" for="adv-return">
                  Annual return (after inflation) %
                </label>
              </div>
              <input
                id="adv-return"
                class="input"
                type="number"
                step={0.01}
                min={-10}
                max={15}
                value={editor.returnPct}
                data-testid="return-input"
                onInput={(e) =>
                  set(
                    'returnPct',
                    // Cap at two decimal places — finer precision is noise.
                    Math.round(Number((e.target as HTMLInputElement).value) * 100) / 100,
                  )
                }
              />
            </div>
            <div class="grid grid-2" style="gap: 12px;">
              <div class="field" style="margin: 0;">
                <div class="field-row">
                  <label class="field-label" for="adv-inflation">
                    Inflation %
                  </label>
                </div>
                <input
                  id="adv-inflation"
                  class="input"
                  type="number"
                  step={0.1}
                  min={0}
                  max={15}
                  value={editor.inflationPct}
                  onInput={(e) => set('inflationPct', Number((e.target as HTMLInputElement).value))}
                />
              </div>
              <div class="field" style="margin: 0;">
                <div class="field-row">
                  <label class="field-label" for="adv-fee">
                    Fund fee %
                  </label>
                </div>
                <input
                  id="adv-fee"
                  class="input"
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={editor.feePct}
                  onInput={(e) => set('feePct', Number((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>
            <div class="field mt-2">
              <div class="field-row">
                <label class="field-label" for="adv-vol">
                  Market volatility
                </label>
              </div>
              <select
                id="adv-vol"
                class="input"
                value={editor.volPreset}
                data-testid="vol-preset"
                onInput={(e) =>
                  set(
                    'volPreset',
                    (e.target as HTMLSelectElement).value as EditorState['volPreset'],
                  )
                }
              >
                <option value="low">Low ({VOL_PRESETS.low * 100}%)</option>
                <option value="med">Medium ({VOL_PRESETS.med * 100}%)</option>
                <option value="high">High ({VOL_PRESETS.high * 100}%)</option>
              </select>
            </div>
            <div class="stack mt-2" style="--stack-gap: 8px;">
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={editor.showRange}
                  data-testid="range-toggle"
                  onChange={(e) => set('showRange', (e.target as HTMLInputElement).checked)}
                />
                <span class="track"></span>
                <span class="field-label">Show range</span>
              </label>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={editor.realView}
                  data-testid="real-toggle"
                  onChange={(e) => set('realView', (e.target as HTMLInputElement).checked)}
                />
                <span class="track"></span>
                <span class="field-label">Today's dollars</span>
              </label>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={editor.includeFees}
                  onChange={(e) => set('includeFees', (e.target as HTMLInputElement).checked)}
                />
                <span class="track"></span>
                <span class="field-label">Include fees</span>
              </label>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={editor.includeEmployer}
                  onChange={(e) => set('includeEmployer', (e.target as HTMLInputElement).checked)}
                />
                <span class="track"></span>
                <span class="field-label">Include employer sources</span>
              </label>
            </div>
          </div>
        </aside>

        {/* ---------- Results column ---------- */}
        <div class="stack" aria-live="polite" data-tour="results">
          {error && (
            <div class="callout" role="alert" style="border-color: var(--flag-red);">
              {error}
            </div>
          )}
          {computing && !run && <div class="card">Simulating 5,000 market paths…</div>}
          {run && (
            <div class="stack" style={computing ? 'opacity: 0.55;' : ''}>
              <div class="result-hero" data-testid="headline">
                <div class="rh-label">At {target} · median of 5,000 simulations</div>
                <div class="rh-value">{formatCents(pctAt(run.mc, target, 2, real))}</div>
                <div class="rh-sub">
                  {real ? "in today's dollars" : 'in future (nominal) dollars'}
                  {editor.showRange
                    ? ` · range ${formatCents(pctAt(run.mc, target, 0, real))} – ${formatCents(pctAt(run.mc, target, 4, real))}`
                    : ''}
                </div>
              </div>

              <div class="fan-wrap">
                <FanChart mc={run.mc} real={real} showRange={editor.showRange} />
              </div>

              <div class="mc-stats">
                <div class="mc-stat low">
                  <div class="lbl">Low (10%)</div>
                  <div class="v">{formatCents(pctAt(run.mc, target, 0, real))}</div>
                </div>
                <div class="mc-stat mid">
                  <div class="lbl">Median</div>
                  <div class="v">{formatCents(pctAt(run.mc, target, 2, real))}</div>
                </div>
                <div class="mc-stat high">
                  <div class="lbl">High (90%)</div>
                  <div class="v">{formatCents(pctAt(run.mc, target, 4, real))}</div>
                </div>
              </div>

              <p class="muted" style="font-size: 0.92rem; margin: 0;">
                In about 90% of the 5,000 simulated markets, the balance at {target} is at least{' '}
                <strong>{formatCents(pctAt(run.mc, target, 0, real))}</strong>
                {real ? ' in today’s dollars' : ''}. The chart shows the median path
                {editor.showRange ? ' with 25–75% and 10–90% bands' : ''}; age runs along the
                bottom.
              </p>

              <div class="table-wrap">
                <table class="compare" data-testid="milestone-table">
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
                          <th>{age}</th>
                          <td>{formatCents(pctAt(run.mc, age, 0, real))}</td>
                          <td class="tabular" style="font-weight: 700;">
                            {formatCents(pctAt(run.mc, age, 2, real))}
                          </td>
                          <td>{formatCents(pctAt(run.mc, age, 4, real))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <p class="muted" data-testid="breakdown" style="font-size: 0.92rem; margin: 0;">
                Where the median comes from:{' '}
                {formatMoney(run.projection.breakdown.contributedCents)} contributed
                {run.projection.breakdown.seedCents > 0n
                  ? ` + ${formatMoney(run.projection.breakdown.seedCents)} federal seed`
                  : ''}{' '}
                + {formatMoney(run.projection.breakdown.growthCents)} growth (net of fees, expected
                path).
                {run.projection.warnings.length > 0 && (
                  <span style="color: var(--warn);">
                    {' '}
                    Some contributions exceed the $5,000/yr cap and were not counted.
                  </span>
                )}
              </p>

              {/* At 18, what next? */}
              {run.projection.startAgeMonths < 216 && tax && (
                <div class="card">
                  <h3>At 18, what next?</h3>
                  <div class="flex gap-3 wrap mt-2" style="align-items: center;">
                    <label class="flex items-center" style="gap: 8px;">
                      <input
                        type="radio"
                        name="at18"
                        checked={editor.at18Path === 'stay-traditional'}
                        onChange={() => set('at18Path', 'stay-traditional')}
                      />
                      Keep as Traditional IRA
                    </label>
                    <label class="flex items-center" style="gap: 8px;">
                      <input
                        type="radio"
                        name="at18"
                        checked={editor.at18Path === 'convert-roth'}
                        onChange={() => set('at18Path', 'convert-roth')}
                      />
                      Convert to Roth at 18
                    </label>
                    <label class="flex items-center" style="gap: 8px;">
                      Future tax rate %
                      <input
                        class="input"
                        type="number"
                        min={0}
                        max={60}
                        value={editor.taxRatePct}
                        style="width: 5.5rem;"
                        onInput={(e) =>
                          set('taxRatePct', Number((e.target as HTMLInputElement).value))
                        }
                      />
                    </label>
                  </div>
                  <p class="muted mt-2" style="font-size: 0.92rem; margin-bottom: 0;">
                    {editor.at18Path === 'stay-traditional' ? (
                      <>
                        Estimated after-tax value at {target} (expected path):{' '}
                        <strong>{formatMoney(tax.afterTaxCents)}</strong> — earnings taxed ~
                        {formatMoney(tax.taxCents)} at withdrawal; contributions come back tax-free.
                      </>
                    ) : (
                      <>
                        Converting at 18 would owe roughly{' '}
                        <strong>{formatMoney(tax.taxCents)}</strong> in tax then (paid from outside
                        the account); qualified withdrawals afterward are tax-free.
                      </>
                    )}{' '}
                    Rolling into a 529 plan is <em>not currently permitted</em> under the statute as
                    far as we can verify. All tax figures are estimates.
                  </p>
                </div>
              )}

              {/* Exports */}
              {encoded && (
                <ExportButtons
                  state={state}
                  projection={run.projection}
                  mc={run.mc}
                  shareUrl={`https://530amodel.com/model?s=${encoded}`}
                />
              )}

              {/* Compare & share */}
              <div class="card" data-tour="share">
                <div class="flex gap-2 wrap" style="align-items: center;">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onClick={copyLink}
                    data-testid="copy-link"
                  >
                    {copied ? 'Copied!' : 'Copy share link'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    onClick={saveCurrent}
                    disabled={!run || saved.length >= 3}
                    data-testid="save-scenario"
                  >
                    + Add to comparison ({saved.length}/3)
                  </button>
                  <span class="muted" style="font-size: 0.88rem;">
                    Compare what-ifs, or add each child to see a family total.
                  </span>
                </div>
                {saved.length > 0 && (
                  <div class="table-wrap mt-2">
                    <table class="compare" data-testid="compare-table">
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
                            <th>{sv.label}</th>
                            <td>{formatCents(pctAt(sv.run.mc, 18, 2, real))}</td>
                            <td>
                              {formatCents(
                                pctAt(
                                  sv.run.mc,
                                  Math.round(sv.state.targetAgeMonths / 12),
                                  2,
                                  real,
                                ),
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <th>Combined</th>
                          <td style="font-weight: 700;">
                            {formatCents(
                              sumMedians([{ label: 'Current', state, run }, ...saved], 18, real),
                            )}
                          </td>
                          <td>—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {saved.length > 0 && (
                  <p class="field-hint" style="margin-bottom: 0;">
                    The combined row adds each scenario's median — a planning aid, not a statistical
                    median of the family total.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
