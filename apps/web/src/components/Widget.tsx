import { formatMoney } from '@530a/engine'
import { useMemo, useState } from 'preact/hooks'
import { milestoneAt, runWidget } from '../lib/scenario'

/**
 * The homepage widget (§5.1): answers "what could this be worth?" in seconds.
 * Deterministic projection only — the fan chart / Monte Carlo lives in the
 * Advanced Model so this island stays tiny and instant.
 */
export default function Widget() {
  const [ageYears, setAgeYears] = useState(1)
  const [monthlyDollars, setMonthlyDollars] = useState(100)
  const [oneTimeDollars, setOneTimeDollars] = useState(0)
  const [includeSeed, setIncludeSeed] = useState(true)

  const asOf = useMemo(() => new Date(), [])
  const result = useMemo(
    () => runWidget({ ageYears, monthlyDollars, oneTimeDollars, includeSeed }, asOf),
    [ageYears, monthlyDollars, oneTimeDollars, includeSeed, asOf],
  )

  const at18 = milestoneAt(result.projection, 18)
  const at36 = milestoneAt(result.projection, 36)
  const at72 = milestoneAt(result.projection, 72)
  const shareHref = `/model?s=${result.shareState}`

  return (
    <div class="card" style="display: grid; gap: 1rem;">
      <div>
        <label for="w-age" style="display: flex; justify-content: space-between;">
          <span>Child's age</span>
          <strong>
            {ageYears} {ageYears === 1 ? 'year' : 'years'} old
          </strong>
        </label>
        <input
          id="w-age"
          type="range"
          min={0}
          max={17}
          step={1}
          value={ageYears}
          onInput={(e) => setAgeYears(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <div>
        <label for="w-monthly" style="display: flex; justify-content: space-between;">
          <span>Monthly contribution</span>
          <strong>${monthlyDollars}/mo</strong>
        </label>
        <input
          id="w-monthly"
          type="range"
          min={0}
          max={415}
          step={5}
          value={monthlyDollars}
          onInput={(e) => setMonthlyDollars(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <div>
        <label for="w-once" style="display: flex; justify-content: space-between;">
          <span>One-time starting gift</span>
          <strong>${oneTimeDollars}</strong>
        </label>
        <input
          id="w-once"
          type="range"
          min={0}
          max={5000}
          step={100}
          value={oneTimeDollars}
          onInput={(e) => setOneTimeDollars(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <label style="display: flex; gap: 0.5rem; align-items: center;">
        <input
          type="checkbox"
          checked={includeSeed}
          onChange={(e) => setIncludeSeed((e.target as HTMLInputElement).checked)}
        />
        <span>
          Include the $1,000 federal seed
          {includeSeed && !result.seedEligible && (
            <span class="muted"> (not applied — only children born 2025–2028 qualify)</span>
          )}
        </span>
      </label>

      <div
        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; text-align: center;"
        aria-live="polite"
      >
        {[
          { age: 18, value: at18 },
          { age: 36, value: at36 },
          { age: 72, value: at72 },
        ].map(({ age, value }) => (
          <div
            key={age}
            style="padding: 0.75rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius);"
          >
            <div class="muted">At age {age}</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: var(--growth-green);">
              {value !== null ? formatMoney(value) : '—'}
            </div>
          </div>
        ))}
      </div>

      <p class="muted" style="margin: 0;">
        In today's dollars, assuming a 7% average annual return after inflation and a 0.03% fund
        fee. Actual results will vary — these are estimates, not guarantees.
      </p>

      <a class="btn" href={shareHref} data-testid="widget-cta" style="text-align: center;">
        See the full picture →
      </a>
    </div>
  )
}
