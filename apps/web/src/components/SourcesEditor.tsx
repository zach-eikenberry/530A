import type { SourceKind } from '@530a/engine'
import { type EditorSource, newSourceId } from '../lib/editor'

/**
 * Contribution sources editor (§5.2): family/relative/charity/employer
 * streams, each with its own schedule and start/stop ages. The engine
 * enforces the $5,000 aggregate and $2,500 employer caps and reports the
 * excess; the UI surfaces those warnings next to the results.
 */

interface Props {
  sources: EditorSource[]
  onChange: (sources: EditorSource[]) => void
}

const KIND_LABEL: Record<SourceKind, string> = {
  family: 'Parents / family',
  relative: 'Relative (gifts)',
  charity: 'Charity / program',
  employer: 'Employer',
}

export default function SourcesEditor({ sources, onChange }: Props) {
  const update = (id: string, patch: Partial<EditorSource>) =>
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const remove = (id: string) => onChange(sources.filter((s) => s.id !== id))
  const add = () =>
    onChange([
      ...sources,
      {
        id: newSourceId(),
        kind: 'relative',
        scheduleType: 'once',
        amountDollars: 500,
        startAgeYears: 0,
        endAgeYears: 18,
        monthOfYear: 1,
        atAgeYears: 1,
        stepUpPct: 0,
      },
    ])

  return (
    <div class="card" style="display: grid; gap: 0.75rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>Who contributes?</strong>
        <button
          type="button"
          class="card"
          style="cursor: pointer; padding: 0.3rem 0.8rem;"
          onClick={add}
          disabled={sources.length >= 6}
          data-testid="add-source"
        >
          + Add contributor
        </button>
      </div>
      {sources.length === 0 && (
        <p class="muted" style="margin: 0;">
          No contributions yet — with just the $1,000 seed, compounding still does something. Add a
          contributor to see more.
        </p>
      )}
      {sources.map((s) => (
        <div
          key={s.id}
          style="display: grid; gap: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem;"
          data-testid="source-row"
        >
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
            <select
              value={s.kind}
              onInput={(e) =>
                update(s.id, { kind: (e.target as HTMLSelectElement).value as SourceKind })
              }
              aria-label="Contributor type"
            >
              {(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              value={s.scheduleType}
              aria-label="Schedule"
              onInput={(e) =>
                update(s.id, {
                  scheduleType: (e.target as HTMLSelectElement)
                    .value as EditorSource['scheduleType'],
                })
              }
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Once a year</option>
              <option value="once">One-time</option>
            </select>
            <label>
              $
              <input
                type="number"
                min={0}
                max={1_000_000}
                value={s.amountDollars}
                style="width: 6.5rem;"
                aria-label="Amount in dollars"
                onInput={(e) =>
                  update(s.id, {
                    amountDollars: Math.max(0, Number((e.target as HTMLInputElement).value)),
                  })
                }
              />
              {s.scheduleType === 'monthly' ? '/mo' : s.scheduleType === 'annual' ? '/yr' : ''}
            </label>
            <button
              type="button"
              class="card"
              style="cursor: pointer; padding: 0.2rem 0.6rem; margin-left: auto;"
              onClick={() => remove(s.id)}
              aria-label={`Remove ${KIND_LABEL[s.kind]} contribution`}
            >
              ✕
            </button>
          </div>
          <div
            style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;"
            class="muted"
          >
            {s.scheduleType === 'once' ? (
              <label>
                at age{' '}
                <input
                  type="number"
                  min={0}
                  max={119}
                  value={s.atAgeYears}
                  style="width: 4rem;"
                  onInput={(e) =>
                    update(s.id, { atAgeYears: Number((e.target as HTMLInputElement).value) })
                  }
                />
              </label>
            ) : (
              <>
                <label>
                  from age{' '}
                  <input
                    type="number"
                    min={0}
                    max={119}
                    value={s.startAgeYears}
                    style="width: 4rem;"
                    onInput={(e) =>
                      update(s.id, { startAgeYears: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                </label>
                <label>
                  to age{' '}
                  <input
                    type="number"
                    min={1}
                    max={119}
                    value={s.endAgeYears}
                    style="width: 4rem;"
                    onInput={(e) =>
                      update(s.id, { endAgeYears: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                </label>
                <label>
                  +% per year{' '}
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={s.stepUpPct}
                    style="width: 4rem;"
                    title="Increase the contribution by this percent each year"
                    onInput={(e) =>
                      update(s.id, { stepUpPct: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                </label>
              </>
            )}
            {s.kind === 'employer' && <span>capped at $2,500/yr by law</span>}
          </div>
        </div>
      ))}
      <p class="muted" style="margin: 0;">
        All sources combined are capped at $5,000 per child per year — anything above shows a
        warning in the results rather than silently counting.
      </p>
    </div>
  )
}
