import type { MonteCarloResult } from '@530a/engine'
import { formatMoney } from '@530a/engine'

/**
 * Fan chart: median line + p25–p75 and p10–p90 bands, hand-rolled SVG.
 * No chart library — keeps the bundle small and the rendering exact.
 * Percentile rows arrive ordered [10, 25, 50, 75, 90].
 */

interface Props {
  mc: MonteCarloResult
  /** Show values deflated to today's dollars (vs nominal). */
  real: boolean
  /** Hide the bands (median-only view). */
  showRange: boolean
}

const W = 640
const H = 320
const PAD = { top: 16, right: 16, bottom: 34, left: 68 }

function niceCeil(v: number): number {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * mag) return m * mag
  }
  return 10 * mag
}

function compactDollars(cents: number): string {
  const d = cents / 100
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(d >= 10_000_000 ? 0 : 1)}M`
  if (d >= 1_000) return `$${(d / 1_000).toFixed(0)}k`
  return `$${d.toFixed(0)}`
}

export default function FanChart({ mc, real, showRange }: Props) {
  const rows = real ? mc.percentileRealCents : mc.percentileCents
  const ages = mc.sampleAgesMonths
  const n = ages.length
  if (n < 2 || !rows[0] || !rows[2] || !rows[4]) return null

  const p10 = rows[0].map(Number)
  const p25 = (rows[1] ?? rows[0]).map(Number)
  const p50 = rows[2].map(Number)
  const p75 = (rows[3] ?? rows[4]).map(Number)
  const p90 = rows[4].map(Number)

  const x0 = (ages[0] as number) / 12
  const x1 = (ages[n - 1] as number) / 12
  const yMax = niceCeil(Math.max(...(showRange ? p90 : p50)) * 1.05)

  const px = (ageYears: number) =>
    PAD.left + ((ageYears - x0) / (x1 - x0)) * (W - PAD.left - PAD.right)
  const py = (cents: number) => PAD.top + (1 - cents / yMax) * (H - PAD.top - PAD.bottom)

  const line = (values: number[]) =>
    values
      .map(
        (v, i) =>
          `${i === 0 ? 'M' : 'L'}${px((ages[i] as number) / 12).toFixed(1)},${py(v).toFixed(1)}`,
      )
      .join('')

  const band = (hi: number[], lo: number[]) =>
    `${line(hi)}${lo
      .map((_, i) => {
        const j = lo.length - 1 - i
        return `L${px((ages[j] as number) / 12).toFixed(1)},${py(lo[j] as number).toFixed(1)}`
      })
      .join('')}Z`

  // Y ticks: quarters of the nice max; X ticks: sensible age steps
  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => f * yMax)
  const span = x1 - x0
  const xStep = span > 60 ? 20 : span > 25 ? 10 : span > 10 ? 5 : 2
  const xTicks: number[] = []
  for (let a = Math.ceil(x0 / xStep) * xStep; a <= x1; a += xStep) xTicks.push(a)

  const last = n - 1
  const label = `Projected balance from age ${Math.round(x0)} to ${Math.round(x1)}. Median at age ${Math.round(x1)}: ${formatMoney(BigInt(Math.round(p50[last] as number)))}${showRange ? `; 10th–90th percentile range ${formatMoney(BigInt(Math.round(p10[last] as number)))} to ${formatMoney(BigInt(Math.round(p90[last] as number)))}` : ''}.`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      style="width: 100%; height: auto; display: block;"
      data-testid="fan-chart"
    >
      <title>{label}</title>
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={py(t)}
            y2={py(t)}
            stroke="var(--border)"
            stroke-width="1"
          />
          <text
            x={PAD.left - 8}
            y={py(t) + 4}
            text-anchor="end"
            font-size="12"
            fill="var(--text-muted)"
          >
            {compactDollars(t)}
          </text>
        </g>
      ))}
      {xTicks.map((a) => (
        <text
          key={a}
          x={px(a)}
          y={H - 10}
          text-anchor="middle"
          font-size="12"
          fill="var(--text-muted)"
        >
          {a}
        </text>
      ))}
      <text
        x={(PAD.left + W - PAD.right) / 2}
        y={H - 10}
        text-anchor="middle"
        font-size="12"
        fill="var(--text-muted)"
        dy="-16"
        style="display:none;"
      >
        Age
      </text>
      {showRange && (
        <>
          <path d={band(p90, p10)} fill="var(--trust-blue)" opacity="0.12" />
          <path d={band(p75, p25)} fill="var(--trust-blue)" opacity="0.22" />
        </>
      )}
      <path d={line(p50)} fill="none" stroke="var(--trust-blue)" stroke-width="2.5" />
      <circle cx={px(x1)} cy={py(p50[last] as number)} r="4" fill="var(--growth-green)" />
    </svg>
  )
}
