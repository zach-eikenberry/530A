import { expect, test } from '@playwright/test'

/**
 * UC-7: reproducibility as a first-class guarantee. A shared ?s= link opened
 * by someone else (fresh browser context, no storage) reconstructs the exact
 * scenario and — because Monte Carlo is seeded — the exact numbers.
 */

test('a shared link reproduces identical numbers in a fresh context', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await pageA.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
  await pageA.goto('/model')
  const headline = pageA.getByTestId('headline')
  await expect(headline).toBeVisible({ timeout: 20_000 })
  const defaultHeadline = await headline.textContent()
  await expect
    .poll(() => new URL(pageA.url()).searchParams.get('s'), { timeout: 20_000 })
    .toBeTruthy()
  const defaultShare = new URL(pageA.url()).searchParams.get('s')

  // Make the scenario non-default so reproduction is meaningful, then wait
  // for the seeded run to land AND the URL to carry the new scenario (the
  // headline paints a beat before the URL write).
  await pageA.getByTestId('quick-250').click()
  await pageA.getByTestId('target-age-slider').fill('60')
  await expect(headline).toContainText('At 60', { timeout: 20_000 })
  await expect(headline).not.toHaveText(defaultHeadline ?? '', { timeout: 20_000 })
  await expect
    .poll(() => new URL(pageA.url()).searchParams.get('s'), { timeout: 20_000 })
    .not.toBe(defaultShare)
  const headlineA = await headline.textContent()
  const shareUrl = pageA.url()
  await ctxA.close()

  // Fresh context: no storage, no history — only the link
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await pageB.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
  await pageB.goto(shareUrl)
  await expect(pageB.getByTestId('headline')).toContainText('At 60', { timeout: 20_000 })
  await expect(pageB.getByTestId('headline')).toHaveText(headlineA ?? '', { timeout: 20_000 })
  await expect(pageB.getByTestId('target-age')).toHaveText('60')
  await ctxB.close()
})
