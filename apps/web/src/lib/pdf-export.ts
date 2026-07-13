import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import { type ExportPayload, money } from './export-data'

/**
 * Client-side PDF (§2.4, §6): rendered entirely in the browser with pdf-lib —
 * zero server compute, inputs never leave the device. The renderer only
 * draws payload values; it never computes money.
 */

const BLUE = rgb(0.114, 0.306, 0.847)
const GREEN = rgb(0.082, 0.502, 0.239)
const MUTED = rgb(0.42, 0.45, 0.5)
const TEXT = rgb(0.06, 0.09, 0.16)

export async function renderPdf(payload: ExportPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(payload.title)
  doc.setProducer('530amodel.com')
  const page = doc.addPage([612, 792]) // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { height } = page.getSize()
  const left = 54
  let y = height - 60

  const text = (
    str: string,
    opts: { size?: number; font?: typeof font; color?: typeof TEXT; x?: number } = {},
  ) => {
    page.drawText(str, {
      x: opts.x ?? left,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? TEXT,
    })
  }

  // Header
  text('530A', { size: 20, font: bold, color: BLUE })
  text('Model', { size: 20, font: bold, color: GREEN, x: left + 52 })
  y -= 18
  text(payload.subtitle, { size: 9, color: MUTED })
  y -= 30

  text(payload.title, { size: 15, font: bold })
  y -= 16
  text(`Generated ${payload.generatedOn} · all "today's dollars" figures are inflation-adjusted`, {
    size: 9,
    color: MUTED,
  })
  y -= 30

  // Headline
  text(`Projected at age ${payload.headline.targetAgeYears}:`, { size: 12 })
  text(money(payload.headline.medianRealCents), {
    size: 16,
    font: bold,
    color: GREEN,
    x: left + 150,
  })
  y -= 16
  text(
    `median of 5,000 simulations · 10th–90th percentile range ${money(payload.headline.lowRealCents)} to ${money(payload.headline.highRealCents)}`,
    { size: 9, color: MUTED },
  )
  y -= 28

  // Milestones table
  text('Milestones (today’s dollars)', { size: 12, font: bold })
  y -= 16
  const cols = [left, left + 70, left + 190, left + 310, left + 430]
  for (const [i, h] of ['Age', 'Low (10%)', 'Median', 'High (90%)', 'Median (nominal)'].entries()) {
    text(h, { size: 9, font: bold, color: MUTED, x: cols[i] })
  }
  y -= 13
  for (const m of payload.milestones) {
    text(String(m.ageYears), { x: cols[0] })
    text(money(m.lowRealCents), { x: cols[1] })
    text(money(m.medianRealCents), { font: bold, x: cols[2] })
    text(money(m.highRealCents), { x: cols[3] })
    text(money(m.medianNominalCents), { color: MUTED, x: cols[4] })
    y -= 14
  }
  y -= 10

  // Breakdown
  text(
    `Expected path: ${money(payload.breakdown.contributedCents)} contributed + ${money(payload.breakdown.seedCents)} seed + ${money(payload.breakdown.growthCents)} growth (net of fees)`,
    { size: 9 },
  )
  y -= 14
  if (payload.capWarningCount > 0) {
    text('Note: some planned contributions exceed the $5,000/yr cap and were not counted.', {
      size: 9,
      color: rgb(0.7, 0.32, 0.04),
    })
    y -= 14
  }
  y -= 12

  // Assumptions
  text('Assumptions (reproducible)', { size: 12, font: bold })
  y -= 15
  for (const [label, value] of payload.assumptions) {
    text(`${label}:`, { size: 9, color: MUTED })
    text(value, { size: 9, x: left + 170 })
    y -= 12
  }
  y -= 12

  // Sources
  text('Sources', { size: 12, font: bold })
  y -= 15
  for (const [label, url] of payload.sources) {
    text(`${label} — ${url}`, { size: 8, color: MUTED })
    y -= 11
  }
  y -= 10

  // QR to the exact scenario
  const qrDataUrl = await QRCode.toDataURL(payload.shareUrl, { margin: 0, width: 96 })
  const png = await doc.embedPng(qrDataUrl)
  page.drawImage(png, { x: 612 - 54 - 72, y: height - 60 - 72 + 14, width: 72, height: 72 })
  page.drawText('Scan to reopen this exact scenario', {
    x: 612 - 54 - 100,
    y: height - 60 - 72,
    size: 6.5,
    font,
    color: MUTED,
  })

  // Disclaimer
  const words = payload.disclaimer.split(' ')
  let line = ''
  const lines: string[] = []
  for (const w of words) {
    if ((line + w).length > 100) {
      lines.push(line.trim())
      line = ''
    }
    line += `${w} `
  }
  lines.push(line.trim())
  for (const l of lines) {
    text(l, { size: 8, color: MUTED })
    y -= 10
  }

  return doc.save()
}

export function downloadBlob(
  bytes: Uint8Array | ArrayBuffer,
  filename: string,
  type: string,
): void {
  const blob = new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
