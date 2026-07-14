import type { MonteCarloResult, Projection, ScenarioState } from '@530a/engine'
import { useState } from 'preact/hooks'
import { track } from '../lib/analytics'
import type { ExportBranding } from '../lib/export-data'

/**
 * Export card (§6): instant client-side downloads, no email required.
 * The heavy libraries (pdf-lib, exceljs, qrcode) load on first click via
 * dynamic import, so they cost the page nothing until used.
 */

interface Props {
  state: ScenarioState
  projection: Projection
  mc: MonteCarloResult
  shareUrl: string
}

export default function ExportButtons({ state, projection, mc, shareUrl }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [firmName, setFirmName] = useState('')
  const [childName, setChildName] = useState('')

  const branding = (): ExportBranding => {
    const b: ExportBranding = {}
    if (firmName.trim()) b.firmName = firmName.trim()
    if (childName.trim()) b.childName = childName.trim()
    return b
  }

  const exportPdf = async () => {
    setBusy('pdf')
    setError(null)
    try {
      const [{ buildExportPayload }, { renderPdf, downloadBlob }] = await Promise.all([
        import('../lib/export-data'),
        import('../lib/pdf-export'),
      ])
      const payload = buildExportPayload(state, projection, mc, shareUrl, branding())
      const bytes = await renderPdf(payload)
      downloadBlob(bytes, '530a-projection.pdf', 'application/pdf')
      track('export', 'pdf')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const exportXlsx = async () => {
    setBusy('xlsx')
    setError(null)
    try {
      const [{ buildExportPayload }, { renderXlsx }, { downloadBlob }] = await Promise.all([
        import('../lib/export-data'),
        import('../lib/xlsx-export'),
        import('../lib/pdf-export'),
      ])
      const payload = buildExportPayload(state, projection, mc, shareUrl, branding())
      const buffer = await renderXlsx(payload)
      downloadBlob(
        buffer,
        '530a-projection.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      track('export', 'xlsx')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div class="card" data-tour="export">
      <h3>Take it with you</h3>
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-top: 0.5rem;">
        <button
          type="button"
          class="btn btn-gold btn-sm"
          onClick={exportPdf}
          disabled={busy !== null}
          data-testid="export-pdf"
        >
          {busy === 'pdf' ? 'Building…' : 'Download PDF'}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={exportXlsx}
          disabled={busy !== null}
          data-testid="export-xlsx"
        >
          {busy === 'xlsx' ? 'Building…' : 'Download Excel'}
        </button>
        <span class="muted">Built on your device — nothing is uploaded.</span>
      </div>
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem;" class="muted">
        <label>
          Child's first name (optional){' '}
          <input
            class="input"
            type="text"
            maxLength={40}
            value={childName}
            onInput={(e) => setChildName((e.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          Firm name for branding (optional){' '}
          <input
            class="input"
            type="text"
            maxLength={60}
            value={firmName}
            onInput={(e) => setFirmName((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" style="color: var(--error); margin-bottom: 0;">
          Export failed: {error}
        </p>
      )}
    </div>
  )
}
