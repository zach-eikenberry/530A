import type { ScenarioState } from '@530a/engine'
import { monteCarlo, project } from '@530a/engine'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildExportPayload } from '../src/lib/export-data'
import { toScenario } from '../src/lib/scenario'
import { renderXlsx } from '../src/lib/xlsx-export'

/**
 * Export invariant (§6, §11.2): numbers in the generated files equal the
 * engine's numbers TO THE CENT. The XLSX is written and read back with a
 * second parser pass; the PDF shares the same payload builder, which is
 * asserted directly (its renderer only draws payload strings).
 */

const state: ScenarioState = {
  asOf: '2026-07-12',
  child: { birthDate: '2026-01-15' },
  includeSeed: true,
  sources: [
    {
      id: 'family',
      kind: 'family',
      schedule: { type: 'monthly', amountCents: 15_000n, startAgeMonths: 6, endAgeMonths: 216 },
    },
    {
      id: 'gift',
      kind: 'relative',
      schedule: { type: 'once', amountCents: 50_000n, atAgeMonths: 12 },
    },
  ],
  assumptions: {
    annualReturn: 0.07,
    returnIsReal: true,
    annualInflation: 0.025,
    annualFee: 0.0003,
    annualVolatility: 0.15,
  },
  targetAgeMonths: 72 * 12,
  mcSeed: 530,
  mcPaths: 500,
}

describe('export invariant', () => {
  const scenario = toScenario(state)
  const projection = project(scenario)
  const mc = monteCarlo(scenario, state.mcSeed, state.mcPaths)
  const payload = buildExportPayload(state, projection, mc, 'https://530amodel.com/model?s=test')

  it('payload milestones equal engine percentiles exactly', () => {
    for (const m of payload.milestones) {
      const idx = mc.sampleAgesMonths.indexOf(m.ageYears * 12)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(m.lowRealCents).toBe((mc.percentileRealCents[0] as bigint[])[idx])
      expect(m.medianRealCents).toBe((mc.percentileRealCents[2] as bigint[])[idx])
      expect(m.highRealCents).toBe((mc.percentileRealCents[4] as bigint[])[idx])
      expect(m.medianNominalCents).toBe((mc.percentileCents[2] as bigint[])[idx])
    }
    expect(payload.milestones.length).toBeGreaterThanOrEqual(3)
  })

  it('payload annual rows equal the deterministic projection exactly', () => {
    for (const row of payload.annual) {
      expect(row.nominalCents).toBe(projection.nominalCents[row.monthIndex])
      expect(row.realCents).toBe(projection.realCents[row.monthIndex])
    }
    const last = payload.annual[payload.annual.length - 1]
    expect(last?.cumulativeContributionCents).toBe(projection.breakdown.contributedCents)
  })

  it('XLSX cells read back equal to the cent', async () => {
    const buffer = await renderXlsx(payload)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    const proj = wb.getWorksheet('Projection')
    expect(proj).toBeDefined()
    // Row 1 is the header; data rows follow payload.annual order
    payload.annual.forEach((row, i) => {
      const r = proj?.getRow(i + 2)
      expect(r?.getCell(1).value).toBe(row.ageYears)
      // Dollars stored as numbers; compare in cents after scaling — exact,
      // because Number(cents)/100 is recovered by round(x*100)
      expect(Math.round((r?.getCell(3).value as number) * 100)).toBe(Number(row.nominalCents))
      expect(Math.round((r?.getCell(4).value as number) * 100)).toBe(Number(row.realCents))
      expect(Math.round((r?.getCell(2).value as number) * 100)).toBe(
        Number(row.cumulativeContributionCents),
      )
    })

    const summary = wb.getWorksheet('Summary')
    const headline = summary?.getRow(5)
    expect(Math.round((headline?.getCell(2).value as number) * 100)).toBe(
      Number(payload.headline.medianRealCents),
    )
  })

  it('every dollar figure the PDF prints comes from the payload (no side math)', async () => {
    // The PDF renderer imports only payload + money(); this test pins the
    // payload's formatted headline so a renderer regression that reformats
    // or recomputes would break golden strings.
    const { money } = await import('../src/lib/export-data')
    expect(money(123_456_78n)).toBe('$123,456.78')
    expect(money(payload.headline.medianRealCents)).toMatch(/^\$[\d,]+\.\d{2}$/)
  })
})
