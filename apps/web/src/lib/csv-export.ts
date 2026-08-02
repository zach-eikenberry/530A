import type { ExportPayload } from './export-data'
import { money } from './export-data'

/**
 * CSV export (§U10): the same ExportPayload the PDF and Excel render — this
 * module only formats, never computes, so the export-invariant guarantee
 * carries over. UTF-8 with BOM so Excel opens it correctly.
 */

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

function row(...cells: string[]): string {
  return cells.map(esc).join(',')
}

export function renderCsv(payload: ExportPayload): string {
  const lines: string[] = []
  lines.push(row(payload.title))
  lines.push(row(payload.subtitle))
  lines.push(row('Generated on', payload.generatedOn))
  lines.push(row('Share link', payload.shareUrl))
  lines.push('')

  lines.push(row('Milestones (percentiles in today’s dollars)'))
  lines.push(row('Age', 'Low (10%)', 'Median', 'High (90%)', 'Median (nominal)'))
  for (const m of payload.milestones) {
    lines.push(
      row(
        String(m.ageYears),
        money(m.lowRealCents),
        money(m.medianRealCents),
        money(m.highRealCents),
        money(m.medianNominalCents),
      ),
    )
  }
  lines.push('')

  lines.push(row('Expected path by year (deterministic)'))
  lines.push(row('Age', 'Cumulative contributions', 'Balance (nominal)', "Balance (today's $)"))
  for (const a of payload.annual) {
    lines.push(
      row(
        String(a.ageYears),
        money(a.cumulativeContributionCents),
        money(a.nominalCents),
        money(a.realCents),
      ),
    )
  }
  lines.push('')

  lines.push(row('Assumptions'))
  for (const [k, v] of payload.assumptions) lines.push(row(k, v))
  lines.push('')
  lines.push(row('Sources'))
  for (const [k, v] of payload.sources) lines.push(row(k, v))
  lines.push('')
  lines.push(row('Disclaimer', payload.disclaimer))

  return `﻿${lines.join('\r\n')}\r\n`
}
