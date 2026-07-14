import { expect, test } from '@playwright/test'

/**
 * UC-6 (§3): visitor reads a pledge → sees eligibility → clicks "Model this
 * gift" → the Advanced Model opens with that contribution pre-filled and
 * attributed. Test builds use the labeled demo fixture (a banner makes demo
 * data unmistakable); only human-approved Tier-B entries expose the button.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
})

test('UC-6: pledge → one-click personalized projection', async ({ page }) => {
  await page.goto('/pledges')

  // Demo data is clearly labeled in test builds
  await expect(page.getByTestId('fixture-banner')).toBeVisible()

  const items = page.getByTestId('pledge-item')
  await expect(items).toHaveCount(2)

  // Eligibility is stated before any modeling
  await expect(page.getByText(/Who may qualify:/)).toBeVisible()
  await expect(page.getByText(/born 2025–2028/)).toBeVisible()

  // Only the Tier-B (human-reviewed) item exposes the model button
  const modelButtons = page.getByTestId('model-this-gift')
  await expect(modelButtons).toHaveCount(1)

  await modelButtons.click()
  await expect(page).toHaveURL(/\/model\?s=1\./)

  // The model reconstructs with the $1,000 pledge as a charity contribution
  await expect(page.getByTestId('headline')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('breakdown')).toContainText('$1,000 contributed')
  await expect(page.getByTestId('source-row')).toHaveCount(1)
  await expect(page.getByTestId('source-row').first()).toContainText('Charity / program')
})

test('display-only (Tier A) items link to their source and never to the model', async ({
  page,
}) => {
  await page.goto('/pledges')
  const tierA = page.getByTestId('pledge-item').nth(1)
  await expect(tierA).toContainText('reported')
  await expect(tierA.getByText('Read the source ↗')).toBeVisible()
  await expect(tierA.getByTestId('model-this-gift')).toHaveCount(0)
})
