import { decodeState, formatMoney, project, StateDecodeError } from '@530a/engine'
import { useMemo } from 'preact/hooks'
import { toScenario } from '../lib/scenario'

/**
 * Advanced Model page island — Phase 2 preview edition. Decodes the shared
 * `?s=` state, reconstructs the exact scenario, and shows the milestone
 * table + assumptions. Phase 3 replaces this with the full model UI
 * (fan chart, Monte Carlo ranges, per-persona views, comparisons).
 */
export default function ModelPreview() {
  const result = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('s')
    if (!encoded) return { kind: 'empty' as const }
    try {
      const state = decodeState(encoded)
      const projection = project(toScenario(state))
      return { kind: 'ok' as const, state, projection }
    } catch (err) {
      if (err instanceof StateDecodeError || err instanceof RangeError) {
        return { kind: 'error' as const, message: err.message }
      }
      throw err
    }
  }, [])

  if (result.kind === 'empty') {
    return (
      <div class="card">
        <p style="margin: 0;">
          No scenario loaded yet. Start with the <a href="/">homepage calculator</a> and click “See
          the full picture,” or open a link someone shared with you — the entire scenario travels in
          the URL.
        </p>
      </div>
    )
  }

  if (result.kind === 'error') {
    return (
      <div class="card" role="alert">
        <p style="margin: 0;">
          That link couldn't be read ({result.message}). Ask for a fresh link or start over on the{' '}
          <a href="/">homepage</a>.
        </p>
      </div>
    )
  }

  const { state, projection } = result
  const a = state.assumptions

  return (
    <div style="display: grid; gap: 1.25rem;">
      <div class="card">
        <h2 style="margin-top: 0;">Projected value (today's dollars)</h2>
        <table data-testid="milestone-table">
          <thead>
            <tr>
              <th>Age</th>
              <th>Projected value</th>
              <th>Nominal (future dollars)</th>
            </tr>
          </thead>
          <tbody>
            {projection.milestones.map((m) => (
              <tr key={m.ageMonths}>
                <td>{m.ageMonths / 12}</td>
                <td style="font-weight: 700; color: var(--growth-green);">
                  {formatMoney(m.realCents)}
                </td>
                <td class="muted">{formatMoney(m.nominalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {projection.warnings.length > 0 && (
          <p class="muted" style="color: var(--warning);">
            Note: some contributions exceed the $5,000/yr cap and were not counted (
            {projection.warnings.length} cap event{projection.warnings.length === 1 ? '' : 's'}).
          </p>
        )}
      </div>

      <div class="card">
        <h2 style="margin-top: 0;">This scenario</h2>
        <table>
          <tbody>
            <tr>
              <td>Contributions</td>
              <td>{formatMoney(projection.breakdown.contributedCents)} total</td>
            </tr>
            <tr>
              <td>Federal seed</td>
              <td>
                {projection.breakdown.seedCents > 0n
                  ? formatMoney(projection.breakdown.seedCents)
                  : 'Not eligible / excluded'}
              </td>
            </tr>
            <tr>
              <td>Growth (net of fees)</td>
              <td>{formatMoney(projection.breakdown.growthCents)}</td>
            </tr>
            <tr>
              <td>Assumed return</td>
              <td>
                {(a.annualReturn * 100).toFixed(1)}% {a.returnIsReal ? 'real' : 'nominal'} ·{' '}
                {(a.annualInflation * 100).toFixed(1)}% inflation · {(a.annualFee * 100).toFixed(2)}
                % fee
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted" style="margin-bottom: 0;">
          Full controls — volatility ranges, multiple contributors, comparisons, exports — are
          coming in the Advanced Model. This link will keep working: the whole scenario lives in the
          URL, nothing is stored on a server.
        </p>
      </div>
    </div>
  )
}
