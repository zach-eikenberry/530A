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
    <div>
      <div class="field-row">
        <div class="pg-title" style="margin: 0;">
          Who contributes?
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={add}
          disabled={sources.length >= 6}
          data-testid="add-source"
        >
          + Add
        </button>
      </div>
      {sources.length === 0 && (
        <p class="field-hint">
          No contributions yet — with just the $1,000 seed, compounding still does something. Add a
          contributor to see more.
        </p>
      )}
      {sources.map((s) => (
        <div
          key={s.id}
          class="mt-2"
          style="border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px;"
          data-testid="source-row"
        >
          <div class="contrib-row">
            <select
              class="input"
              value={s.kind}
              style="flex: 1;"
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
            <button
              type="button"
              class="icon-btn"
              onClick={() => remove(s.id)}
              aria-label={`Remove ${KIND_LABEL[s.kind]} contribution`}
            >
              ✕
            </button>
          </div>
          <div class="contrib-row">
            <select
              class="input"
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
            <div class="input-money" style="flex: 1;">
              <input
                class="input"
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                value={s.amountDollars}
                aria-label="Amount in US dollars"
                onInput={(e) =>
                  update(s.id, {
                    // USD, whole cents: clamp negatives and sub-cent noise.
                    amountDollars: Math.max(
                      0,
                      Math.round(Number((e.target as HTMLInputElement).value) * 100) / 100,
                    ),
                  })
                }
              />
            </div>
            <span class="muted" style="font-size: 0.85rem; flex: none;">
              {s.scheduleType === 'monthly' ? '/mo' : s.scheduleType === 'annual' ? '/yr' : ''}
            </span>
          </div>
          <div class="field-hint flex gap-2 wrap items-center">
            {s.scheduleType === 'once' ? (
              <label>
                at age{' '}
                <input
                  class="input"
                  type="number"
                  min={0}
                  max={119}
                  value={s.atAgeYears}
                  style="width: 4.5rem; padding: 6px 8px;"
                  onInput={(e) =>
                    update(s.id, { atAgeYears: Number((e.target as HTMLInputElement).value) })
                  }
                />
              </label>
            ) : (
              <>
                <label>
                  age{' '}
                  <input
                    class="input"
                    type="number"
                    min={0}
                    max={119}
                    value={s.startAgeYears}
                    style="width: 4.2rem; padding: 6px 8px;"
                    onInput={(e) =>
                      update(s.id, { startAgeYears: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                </label>
                <label>
                  to{' '}
                  <input
                    class="input"
                    type="number"
                    min={1}
                    max={119}
                    value={s.endAgeYears}
                    style="width: 4.2rem; padding: 6px 8px;"
                    onInput={(e) =>
                      update(s.id, { endAgeYears: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                </label>
                <label title="Increase the contribution by this percent each year">
                  +%/yr{' '}
                  <input
                    class="input"
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={s.stepUpPct}
                    style="width: 4.2rem; padding: 6px 8px;"
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
      <p class="field-hint">
        All sources combined are capped at $5,000 per child per year — anything above shows a
        warning in the results rather than silently counting.
      </p>
    </div>
  )
}
