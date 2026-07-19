import { formatMoney, type Projection } from '@530a/engine'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { milestoneAt, runWidget } from '../lib/scenario'

function breakdownAt18(p: Projection): { contributed: bigint; seed: bigint; growth: bigint } {
  // Widget sources all stop at 18, so total contributions == contributions by 18.
  const at18 = p.milestones.find((m) => m.ageMonths === 216)
  const contributed = p.breakdown.contributedCents
  const seed = p.breakdown.seedCents
  const growth = at18 ? at18.nominalCents - contributed - seed : 0n
  return { contributed, seed, growth }
}

function growthShare(p: Projection): string {
  const final = p.nominalCents[p.months]
  if (final === undefined || final <= 0n || p.breakdown.growthCents <= 0n) return '—'
  return `${Math.round((Number(p.breakdown.growthCents) / Number(final)) * 100)}%`
}

/**
 * Homepage calculator (§5.1) in the navy+gold design: answers "what could
 * this be worth?" in seconds. Deterministic projection only — Monte Carlo
 * lives in the Advanced Model so this island stays tiny and instant.
 */

const RETURN_PRESETS = [
  { pct: 5, label: '5%', title: '5% assumed annual return (conservative)' },
  { pct: 7, label: '7%', title: '7% assumed annual return (moderate)' },
  {
    pct: 10,
    label: '10%',
    title: '10% — optimistic; near the S&P 500 long-run average before inflation',
  },
] as const

export default function Widget() {
  const [ageYears, setAgeYears] = useState(1)
  const [monthlyDollars, setMonthlyDollars] = useState(100)
  const [oneTimeDollars, setOneTimeDollars] = useState(0)
  const [includeSeed, setIncludeSeed] = useState(true)
  const [returnPct, setReturnPct] = useState(7)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const asOf = useMemo(() => new Date(), [])
  const result = useMemo(
    () =>
      runWidget(
        { ageYears, monthlyDollars, oneTimeDollars, includeSeed, annualReturnPct: returnPct },
        asOf,
      ),
    [ageYears, monthlyDollars, oneTimeDollars, includeSeed, returnPct, asOf],
  )

  const at18 = milestoneAt(result.projection, 18)
  const at36 = milestoneAt(result.projection, 36)
  const at72 = milestoneAt(result.projection, 72)
  const b18 = breakdownAt18(result.projection)
  const shareHref = `/model?s=${result.shareState}`
  const capped = monthlyDollars > 416

  return (
    <div class="calc" id="calc" data-hydrated={hydrated || undefined}>
      <div class="calc-head">
        <p class="calc-title" style="margin: 0;">
          Child's Investment Return Projection
        </p>
        {/* biome-ignore lint/a11y/useSemanticElements: fieldset styling breaks the segmented control; role=group is valid ARIA */}
        <div class="segmented" role="group" aria-label="Return assumption">
          {RETURN_PRESETS.map((p) => (
            <button
              type="button"
              key={p.pct}
              aria-pressed={returnPct === p.pct}
              title={p.title}
              data-testid={`return-${p.pct}`}
              onClick={() => setReturnPct(p.pct)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div class="calc-body">
        <div class="field">
          <div class="field-row">
            <span class="field-label" id="w-age-label">
              Child's age today
            </span>
            <span class="field-value">
              {ageYears} {ageYears === 1 ? 'year' : 'years'} old
            </span>
          </div>
          <input
            id="w-age"
            type="range"
            min={0}
            max={17}
            step={1}
            value={ageYears}
            aria-labelledby="w-age-label"
            aria-label="Child's age today"
            onInput={(e) => setAgeYears(Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <div class="field">
          <div class="field-row">
            <span class="field-label">Monthly contribution — until age 18</span>
            <span class="field-value">${monthlyDollars}/mo</span>
          </div>
          <input
            id="w-monthly"
            type="range"
            min={0}
            max={415}
            step={5}
            value={monthlyDollars}
            aria-label="Monthly contribution until age 18"
            onInput={(e) => setMonthlyDollars(Number((e.target as HTMLInputElement).value))}
          />
          <div class="field-hint">
            Contributions run through age 18, then stop — the balance keeps compounding untouched to
            36 and 72.
          </div>
          {capped && (
            <div class="field-hint" style="color: var(--warn);">
              Capped to the $5,000/year combined contribution limit.
            </div>
          )}
        </div>

        <div class="grid grid-2" style="gap: 16px;">
          <div class="field" style="margin: 0;">
            <div class="field-row">
              <span class="field-label">One-time gift</span>
            </div>
            <div class="input-money">
              <input
                id="w-once"
                class="input"
                type="number"
                min={0}
                step={50}
                value={oneTimeDollars}
                placeholder="0"
                aria-label="One-time starting gift"
                onInput={(e) =>
                  setOneTimeDollars(Math.max(0, Number((e.target as HTMLInputElement).value)))
                }
              />
            </div>
          </div>
          <div
            class="field flex items-center"
            style="margin: 0; align-items: flex-end; padding-bottom: 6px;"
          >
            <label class="toggle">
              <input
                type="checkbox"
                checked={includeSeed}
                onChange={(e) => setIncludeSeed((e.target as HTMLInputElement).checked)}
              />
              <span class="track"></span>
              <span class="field-label">
                Add $1,000 federal seed
                {includeSeed && !result.seedEligible && (
                  <span class="muted" style="font-weight: 400;">
                    {' '}
                    (not applied — only children born 2025–2028 qualify)
                  </span>
                )}
              </span>
            </label>
          </div>
        </div>

        <div class="results mt-3" aria-live="polite">
          <div class="result-hero">
            <div class="rh-label">Projected balance</div>
            <div class="rh-value">{at18 !== null ? formatMoney(at18) : '—'}</div>
            <div class="rh-sub">at age 18, in today's dollars</div>
          </div>

          <div class="milestones">
            {[
              { age: 36, value: at36, note: 'first house years' },
              { age: 72, value: at72, note: 'retirement' },
            ].map(({ age, value, note }) => (
              <div class="milestone" key={age}>
                <div class="m-age">At age {age}</div>
                <div class="m-val">{value !== null ? formatMoney(value) : '—'}</div>
                <div class="m-note">{note}</div>
              </div>
            ))}
            <div class="milestone">
              <div class="m-age">Growth share</div>
              <div class="m-val">{growthShare(result.projection)}</div>
              <div class="m-note">of the balance at 72 is growth</div>
            </div>
          </div>

          <div class="breakdown">
            <div class="bd">
              <span>Contributions by 18</span>
              <b>{formatMoney(b18.contributed)}</b>
            </div>
            <div class="bd">
              <span>Federal seed</span>
              <b>{b18.seed > 0n ? formatMoney(b18.seed) : '$0'}</b>
            </div>
            <div class="bd">
              <span>Growth by 18</span>
              <b>{formatMoney(b18.growth)}</b>
            </div>
            <div class="bd">
              <span>
                <strong>Assumes</strong>
              </span>
              <b>{returnPct}%/yr · 0.03% fee</b>
            </div>
          </div>

          <p class="field-hint" style="margin: 0;">
            Values are in today's dollars (inflation-adjusted estimates), not guarantees.
          </p>

          <div class="flex gap-2 wrap mt-2">
            <a class="btn btn-gold" href={shareHref} data-testid="widget-cta">
              See the full picture →
            </a>
            <a class="btn btn-ghost" href="/model">
              Add Monte Carlo &amp; taxes
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
