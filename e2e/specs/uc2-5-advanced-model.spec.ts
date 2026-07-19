import { expect, type Page, test } from '@playwright/test'

/**
 * UC-2…UC-5 (§3) against the Advanced Model, plus reproducibility (UC-7's
 * core guarantee: a shared link reconstructs the identical scenario, same
 * seed → same ranges).
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
})

async function waitForResults(page: Page): Promise<string> {
  const headline = page.getByTestId('headline')
  await expect(headline).toBeVisible({ timeout: 20_000 })
  return (await headline.textContent()) ?? ''
}

test('UC-2: parent toggles affordability presets and compares scenarios', async ({ page }) => {
  await page.goto('/model')
  const before = await waitForResults(page)

  // $25 → $250 quick-set changes the outcome
  await page.getByTestId('quick-25').click()
  await expect(page.getByTestId('headline')).not.toHaveText(before, { timeout: 20_000 })
  const at25 = await waitForResults(page)

  // Save for comparison, then switch to $250
  await page.getByTestId('save-scenario').click()
  await page.getByTestId('quick-250').click()
  await expect(page.getByTestId('headline')).not.toHaveText(at25, { timeout: 20_000 })

  // Comparison table shows both plus a combined row
  const compare = page.getByTestId('compare-table')
  await expect(compare).toBeVisible()
  await expect(compare).toContainText('Scenario 1')
  await expect(compare).toContainText('Combined')
})

test('UC-3: relative models a one-time gift and the link reproduces it exactly', async ({
  page,
}) => {
  await page.goto('/model')
  await waitForResults(page)

  // Add a one-time $500 gift at age 1. Geometry is verified reachable
  // (hit-test lands on the button); force bypasses a mobile-emulation
  // layout-settling race while the fan chart paints.
  const add = page.getByTestId('add-source')
  await add.scrollIntoViewIfNeeded()
  await add.click({ force: true })
  const rows = page.getByTestId('source-row')
  await expect(rows).toHaveCount(2)
  const headline = await waitForResults(page)

  // Copy link → the URL now encodes the scenario; opening it reproduces the
  // exact same headline (same seed → identical Monte-Carlo percentiles)
  const url = page.url()
  expect(url).toContain('?s=1.')
  await page.goto('about:blank')
  await page.goto(url)
  const reproduced = await waitForResults(page)
  expect(reproduced).toBe(headline)
})

test('UC-4: charity sizes a cohort and works backward from a budget', async ({ page }) => {
  await page.goto('/model')
  await waitForResults(page)

  await page.getByRole('tab', { name: /charities/i }).click()
  const panel = page.getByTestId('cohort-panel')
  await expect(panel).toBeVisible()

  // 500 kids, $500k budget → $1,000 per child
  await panel.locator('input').first().fill('500')
  await panel.locator('input').nth(1).fill('500000')
  await expect(panel).toContainText('$1,000')

  // Compliance honesty: qualified-class caveat is visible
  await expect(page.getByText(/qualified class/i)).toBeVisible()

  await page.getByTestId('apply-per-child').click()
  await waitForResults(page)
  await expect(page.getByTestId('breakdown')).toContainText('$1,000 contributed')
})

test('UC-5: advisor controls assumptions and the range toggle works', async ({ page }) => {
  await page.goto('/model')
  const before = await waitForResults(page)

  await page.getByRole('tab', { name: /advisors/i }).click()

  // Change return assumption → results move
  await page.getByTestId('return-input').fill('5')
  await expect(page.getByTestId('headline')).not.toHaveText(before, { timeout: 20_000 })

  // Median-only view hides the range text; fan chart stays
  await expect(page.getByTestId('headline')).toContainText('range')
  await page.getByTestId('range-toggle').uncheck()
  await expect(page.getByTestId('headline')).not.toContainText('range')
  await expect(page.getByTestId('fan-chart')).toBeVisible()

  // Volatility preset changes the range width (sanity: headline changes)
  await page.getByTestId('range-toggle').check()
  const med = await waitForResults(page)
  await page.getByTestId('vol-preset').selectOption('high')
  await expect(page.getByTestId('headline')).not.toHaveText(med, { timeout: 20_000 })
})

test('walkthrough shows once and the first-use notice can be dismissed', async ({ browser }) => {
  // Fresh context: no pre-dismissed storage
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/model')

  // Tour appears; step through it
  await expect(page.getByTestId('tour-next')).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('tour-next').click()
  }
  await expect(page.getByTestId('tour-next')).toHaveCount(0)

  // First-use notice is visible until dismissed
  await expect(page.locator('#first-use-notice')).toBeVisible()
  await page.locator('#first-use-dismiss').click()
  await expect(page.locator('#first-use-notice')).toBeHidden()

  // Both stay dismissed on reload
  await page.reload()
  await expect(page.getByTestId('tour-next')).toHaveCount(0)
  await expect(page.locator('#first-use-notice')).toBeHidden()
  await ctx.close()
})

test('at-18 branch: 529 honestly marked not permitted; tax paths estimate', async ({ page }) => {
  await page.goto('/model')
  await waitForResults(page)
  await expect(page.getByText(/not currently permitted/i)).toBeVisible()
  await page.getByRole('radio', { name: /convert to roth/i }).check()
  await expect(page.getByText(/tax then \(paid from outside/i)).toBeVisible()
})

test('switching to an older child never crashes and clamps the target age', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/model')
  await waitForResults(page)

  // Regression (Sentry JAVASCRIPT-2): oldest birth year + a low target age
  // used to throw an unhandled RangeError from the at-18 tax panel.
  await page.getByTestId('target-age-slider').fill('18')
  await page.getByTestId('birth-year').selectOption('2008')

  await expect(page.getByTestId('headline')).toBeVisible({ timeout: 20_000 })
  const target = Number(await page.getByTestId('target-age').textContent())
  const birthYearAge = new Date().getFullYear() - 2008
  expect(target).toBeGreaterThan(birthYearAge)
  expect(errors).toEqual([])
})

test('live return presets set the return field from market data', async ({ page }) => {
  await page.route('**/v1/returns', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-07-18',
        source: 'test',
        note: 'test',
        funds: {
          SPYM: { '1y': 0.2, '5y': 0.12, '10y': 0.15 },
          IVV: { '1y': 0.18, '5y': 0.11, '10y': 0.1 },
          VTI: { '1y': null, '5y': null, '10y': null },
          SPTM: { '1y': 0.19, '5y': 0.12, '10y': 0.14 },
          ITOT: { '1y': 0.17, '5y': 0.11, '10y': 0.13 },
        },
      },
    }),
  )
  await page.goto('/model')
  await waitForResults(page)

  // Default fund (SPYM), 10-yr: 15% nominal → 12.20% after the default 2.5% inflation
  await page.getByTestId('period-10y').click()
  await expect(page.getByTestId('return-input')).toHaveValue('12.20')
  await expect(page.getByTestId('live-return-hint')).toContainText('market data as of 2026-07-18')

  // Switching fund recomputes: IVV 10-yr 10% nominal → 7.32%
  await page.getByTestId('fund-IVV').click()
  await expect(page.getByTestId('return-input')).toHaveValue('7.32')

  // A fund with no data disables the period dials
  await page.getByTestId('fund-VTI').click()
  await expect(page.getByTestId('period-10y')).toBeDisabled()

  // Typing in the field hands control back to Custom
  await page.getByTestId('fund-IVV').click()
  await page.getByTestId('return-input').fill('6.789')
  await expect(page.getByTestId('period-custom')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('return-input')).toHaveValue('6.79')
})
