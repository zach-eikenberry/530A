import { SEED_BIRTH_WINDOW } from '@530a/config'
import { useState } from 'preact/hooks'
import { track } from '../lib/analytics'

/**
 * Three-question eligibility checker (§U8): birth year, citizenship, SSN.
 * Answers stay on-device; only a coarse outcome event is tracked. Seed
 * window comes from the same rules.ts constants the engine uses.
 */

const SEED_START_YEAR = Number(SEED_BIRTH_WINDOW.value.start.slice(0, 4))
const SEED_END_YEAR = Number(SEED_BIRTH_WINDOW.value.end.slice(0, 4))

type YesNo = 'yes' | 'no' | null

export default function EligibilityCheck() {
  const now = new Date().getFullYear()
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [citizen, setCitizen] = useState<YesNo>(null)
  const [ssn, setSsn] = useState<YesNo>(null)

  const answered = birthYear !== null && citizen !== null && ssn !== null
  const under18 = birthYear !== null && now - birthYear < 18
  const eligible = answered && under18 && citizen === 'yes' && ssn === 'yes'
  const seedEligible = eligible && birthYear >= SEED_START_YEAR && birthYear <= SEED_END_YEAR

  const [reported, setReported] = useState(false)
  if (answered && !reported) {
    setReported(true)
    track('eligibility_checked', seedEligible ? 'seed' : eligible ? 'eligible' : 'not-eligible')
  }

  const yesNo = (label: string, value: YesNo, set: (v: YesNo) => void, name: string) => (
    <div class="field" style="margin: 0;">
      <div class="field-row">
        <span class="field-label">{label}</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset styling breaks the segmented control; role=group is valid ARIA */}
      <div class="segmented" role="group" aria-label={label}>
        {(['yes', 'no'] as const).map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={value === v}
            data-testid={`${name}-${v}`}
            onClick={() => set(v)}
          >
            {v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div class="card" data-testid="eligibility-check">
      <h2 style="font-size: 1.17rem; margin-top: 0;">Is your child eligible?</h2>
      <p class="muted" style="font-size: 0.92rem;">
        Three questions, answered on your device — nothing is sent anywhere.
      </p>
      <div class="grid grid-3" style="gap: 16px; align-items: end;">
        <div class="field" style="margin: 0;">
          <div class="field-row">
            <label class="field-label" for="elig-birth-year">
              Child's birth year
            </label>
          </div>
          <select
            id="elig-birth-year"
            class="input"
            data-testid="elig-birth-year"
            onInput={(e) => {
              const v = (e.target as HTMLSelectElement).value
              setBirthYear(v ? Number(v) : null)
            }}
          >
            <option value="">Choose…</option>
            {Array.from({ length: now - 2007 + 1 }, (_, i) => now - i).map((y) => (
              <option key={y} value={y}>
                {y}
                {y >= SEED_START_YEAR && y <= SEED_END_YEAR ? ' (seed window)' : ''}
              </option>
            ))}
          </select>
        </div>
        {yesNo('U.S. citizen?', citizen, setCitizen, 'elig-citizen')}
        {yesNo('Has a Social Security number?', ssn, setSsn, 'elig-ssn')}
      </div>
      {answered && (
        <div
          class={eligible ? 'callout callout-info mt-3' : 'callout mt-3'}
          role="status"
          data-testid="elig-result"
        >
          {seedEligible ? (
            <>
              <strong>Eligible — including the $1,000 federal seed.</strong> Born {SEED_START_YEAR}–
              {SEED_END_YEAR}, U.S. citizen, with an SSN: your child qualifies for the one-time seed
              on top of regular contributions. <a href="/open-account">Open the account</a> or{' '}
              <a href="/">see what it could become</a>.
            </>
          ) : eligible ? (
            <>
              <strong>Eligible for an account.</strong> The $1,000 seed is only for births{' '}
              {SEED_START_YEAR}–{SEED_END_YEAR}, but contributions and compounding work the same.{' '}
              <a href="/open-account">How to open one</a> · <a href="/">project the outcome</a>.
            </>
          ) : !under18 ? (
            <>
              <strong>Not eligible:</strong> 530A accounts are for children under 18. Once the child
              is 18 the account rules shift to Traditional-IRA treatment — see{' '}
              <a href="/withdrawals">the withdrawal rules</a>.
            </>
          ) : (
            <>
              <strong>Likely not eligible as answered.</strong> The statute requires U.S.
              citizenship and a Social Security number. Rules can change — check the{' '}
              <a href="/resources">primary sources</a>.
            </>
          )}
        </div>
      )}
    </div>
  )
}
