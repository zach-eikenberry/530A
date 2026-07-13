import {
  ANNUAL_CAP_CENTS,
  CONTRIBUTION_FLOOR_DATE,
  EMPLOYER_CAP_CENTS,
  FEDERAL_SEED_CENTS,
  SEED_BIRTH_WINDOW,
} from '@530a/config'
import { formatMoney, project, type Scenario } from '@530a/engine'
import { expect, test } from '@playwright/test'

/**
 * UC-1 · Parent, first touch (§3): lands on homepage → sees the widget
 * pre-filled → drags sliders → sees projected values at 18/36/72 in today's
 * dollars → clicks "See the full picture" → the model page reconstructs the
 * exact scenario.
 *
 * Acceptance: the widget's headline numbers equal the engine's output TO THE
 * CENT — computed here independently with the same inputs.
 */

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function expectedWidget(ageYears: number, monthlyDollars: number): Scenario {
  const today = new Date()
  const birth = new Date(today)
  birth.setFullYear(birth.getFullYear() - ageYears)
  const birthIso = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}`
  return {
    schemaVersion: 1,
    asOf: isoToday(),
    child: { birthDate: birthIso },
    includeSeed: true,
    sources: [
      {
        id: 'family',
        kind: 'family',
        schedule: {
          type: 'monthly',
          amountCents: BigInt(monthlyDollars) * 100n,
          startAgeMonths: ageYears * 12,
          endAgeMonths: 18 * 12,
        },
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
    rules: {
      seedCents: FEDERAL_SEED_CENTS.value,
      seedBirthWindow: SEED_BIRTH_WINDOW.value,
      annualCapCents: ANNUAL_CAP_CENTS.value,
      employerAnnualCapCents: EMPLOYER_CAP_CENTS.value,
      contributionFloor: CONTRIBUTION_FLOOR_DATE.value,
    },
  }
}

test.beforeEach(async ({ page }) => {
  // Pre-dismiss the one-time notice and walkthrough so flows aren't blocked;
  // both have their own dedicated tests.
  await page.addInitScript(() => {
    localStorage.setItem('530a-notice-dismissed', '1')
    localStorage.setItem('530a-walkthrough-done', '1')
  })
})

test('UC-1: widget → engine-exact numbers → model page handoff', async ({ page }) => {
  await page.goto('/')

  // The widget renders pre-filled with a sensible example
  await expect(page.getByLabel(/Child's age/i)).toBeVisible()
  const cta = page.getByTestId('widget-cta')
  await expect(cta).toBeVisible()

  // Set deterministic inputs: age 1, $150/mo, no one-time gift
  const setRange = async (selector: string, value: number) => {
    await page.locator(selector).evaluate((el, v) => {
      const input = el as HTMLInputElement
      input.value = String(v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  await setRange('#w-age', 1)
  await setRange('#w-monthly', 150)
  await setRange('#w-once', 0)

  // Independently compute what the engine says for these inputs
  const projection = project(expectedWidget(1, 150))
  const at18 = projection.milestones.find((m) => m.ageMonths === 216)
  const at72 = projection.milestones.find((m) => m.ageMonths === 864)
  if (!at18 || !at72) throw new Error('expected milestones missing')

  // The widget must show those exact formatted values (to-the-cent invariant)
  await expect(page.getByText(formatMoney(at18.realCents))).toBeVisible()
  await expect(page.getByText(formatMoney(at72.realCents))).toBeVisible()

  // Handoff: the CTA carries the scenario into the model page via ?s=
  await expect(cta).toHaveAttribute('href', /\/model\?s=1\./)
  await cta.click()
  await expect(page).toHaveURL(/\/model\?s=/)

  // The model page reconstructs the identical scenario. Its tables show
  // Monte-Carlo medians (not the deterministic path), so the exact-match
  // assertion uses the deterministic breakdown, which must agree to the cent.
  await expect(page.getByTestId('milestone-table')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('breakdown')).toContainText(
    formatMoney(projection.breakdown.contributedCents),
  )
  await expect(page.getByTestId('headline')).toContainText('At 72')
})

test('UC-1: seed ineligibility is stated honestly for older children', async ({ page }) => {
  await page.goto('/')
  await page.locator('#w-age').evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = '10'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.getByText(/not applied — only children born 2025–2028 qualify/)).toBeVisible()
})

test('UC-1: keyboard-only pass reaches the CTA', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByTestId('widget-cta')
  // Tab from the top of the document until the CTA has focus (bounded)
  for (let i = 0; i < 25; i++) {
    const focused = await cta.evaluate((el) => el === document.activeElement)
    if (focused) break
    await page.keyboard.press('Tab')
  }
  await expect(cta).toBeFocused()
})

test('core pages render with canonical tags and structured data', async ({ page }) => {
  for (const path of ['/', '/faq', '/resources', '/terms', '/privacy', '/why-free']) {
    await page.goto(path)
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveAttribute(
      'href',
      new RegExp(`^https://530amodel\\.com${path === '/' ? '/' : path}$`),
    )
    expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0)
  }
})

test('robots.txt, llms.txt, and sitemap are served', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toContain('GPTBot')

  const llms = await request.get('/llms.txt')
  expect(llms.ok()).toBe(true)
  expect(await llms.text()).toContain('# 530A Model')

  const sitemap = await request.get('/sitemap-index.xml')
  expect(sitemap.ok()).toBe(true)
})
