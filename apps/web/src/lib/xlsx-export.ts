import ExcelJS from 'exceljs'
import type { ExportPayload } from './export-data'

/**
 * Client-side Excel (§2.4, §6): built in the browser with exceljs. Cell
 * values are the ENGINE's numbers (dollars, exact to the cent) — the
 * export-invariant test reads them back and compares. A method note
 * explains how to reproduce the figures; we deliberately ship values, not
 * live formulas, because Excel's ROUND() is half-away-from-zero while the
 * engine (and the law of the land here) is banker's rounding — a formula
 * sheet that "recomputes" could drift a cent and betray the invariant.
 */

function dollars(cents: bigint): number {
  return Number(cents) / 100
}

export async function renderXlsx(payload: ExportPayload): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '530amodel.com'
  wb.created = new Date(`${payload.generatedOn}T00:00:00Z`)

  const money = '"$"#,##0.00'

  // Summary sheet
  const summary = wb.addWorksheet('Summary')
  summary.columns = [{ width: 34 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 22 }]
  summary.addRow([payload.title]).font = { bold: true, size: 14 }
  summary.addRow([payload.subtitle]).font = { color: { argb: 'FF64748B' }, size: 10 }
  summary.addRow([])
  summary.addRow([`Projected at age ${payload.headline.targetAgeYears} (today's dollars)`]).font = {
    bold: true,
  }
  const headlineRow = summary.addRow([
    'Median of 5,000 simulations',
    dollars(payload.headline.medianRealCents),
  ])
  headlineRow.getCell(2).numFmt = money
  const rangeRow = summary.addRow([
    '10th–90th percentile range',
    dollars(payload.headline.lowRealCents),
    dollars(payload.headline.highRealCents),
  ])
  rangeRow.getCell(2).numFmt = money
  rangeRow.getCell(3).numFmt = money
  summary.addRow([])

  const header = summary.addRow(['Age', 'Low (10%)', 'Median', 'High (90%)', 'Median (nominal $)'])
  header.font = { bold: true }
  for (const m of payload.milestones) {
    const r = summary.addRow([
      m.ageYears,
      dollars(m.lowRealCents),
      dollars(m.medianRealCents),
      dollars(m.highRealCents),
      dollars(m.medianNominalCents),
    ])
    for (const c of [2, 3, 4, 5]) r.getCell(c).numFmt = money
  }
  summary.addRow([])
  const b = payload.breakdown
  const br = summary.addRow([
    'Expected path: contributed / seed / growth',
    dollars(b.contributedCents),
    dollars(b.seedCents),
    dollars(b.growthCents),
  ])
  for (const c of [2, 3, 4]) br.getCell(c).numFmt = money
  if (payload.capWarningCount > 0) {
    summary.addRow([
      'Note: some planned contributions exceed the $5,000/yr cap and were not counted.',
    ]).font = { color: { argb: 'FFB45309' } }
  }
  summary.addRow([])
  summary.addRow(['Assumptions']).font = { bold: true }
  for (const [label, value] of payload.assumptions) summary.addRow([label, value])
  summary.addRow([])
  summary.addRow(['Reopen this exact scenario', payload.shareUrl])
  summary.addRow([])
  summary.addRow([payload.disclaimer]).font = { color: { argb: 'FF64748B' }, size: 9 }

  // Annual projection sheet (deterministic expected path)
  const proj = wb.addWorksheet('Projection')
  proj.columns = [{ width: 8 }, { width: 24 }, { width: 20 }, { width: 20 }]
  proj.addRow([
    'Age',
    'Cumulative contributions',
    'Balance (nominal $)',
    "Balance (today's $)",
  ]).font = { bold: true }
  for (const row of payload.annual) {
    const r = proj.addRow([
      row.ageYears,
      dollars(row.cumulativeContributionCents),
      dollars(row.nominalCents),
      dollars(row.realCents),
    ])
    for (const c of [2, 3, 4]) r.getCell(c).numFmt = money
  }
  proj.addRow([])
  proj.addRow([
    'Method: monthly compounding of the expected return net of fees; balances quantized to whole',
  ])
  proj.addRow([
    'cents each month using banker’s rounding. Values are exact engine output (see 530amodel.com/methodology).',
  ])

  // Sources sheet
  const src = wb.addWorksheet('Sources')
  src.columns = [{ width: 28 }, { width: 80 }]
  src.addRow(['Source', 'URL']).font = { bold: true }
  for (const [label, url] of payload.sources) src.addRow([label, url])

  return wb.xlsx.writeBuffer()
}
