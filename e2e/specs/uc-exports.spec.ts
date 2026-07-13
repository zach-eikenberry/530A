import { expect, test } from '@playwright/test'

/** Phase 4 (§6): instant client-side PDF/Excel downloads, no email, no upload. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
})

test('PDF and Excel downloads are produced client-side', async ({ page }) => {
  await page.goto('/model')
  await expect(page.getByTestId('headline')).toBeVisible({ timeout: 20_000 })

  // Personalize: child name flows into the export
  await page.getByLabel(/child's first name/i).fill('Avery')

  const pdfDownload = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const pdf = await pdfDownload
  expect(pdf.suggestedFilename()).toBe('530a-projection.pdf')
  const pdfPath = await pdf.path()
  const { statSync } = await import('node:fs')
  expect(statSync(pdfPath).size).toBeGreaterThan(5_000)

  const xlsxDownload = page.waitForEvent('download')
  await page.getByTestId('export-xlsx').click()
  const xlsx = await xlsxDownload
  expect(xlsx.suggestedFilename()).toBe('530a-projection.xlsx')
  expect(statSync(await xlsx.path()).size).toBeGreaterThan(5_000)
})
