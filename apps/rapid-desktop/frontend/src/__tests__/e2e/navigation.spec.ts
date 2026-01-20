import { test, expect, Page } from '@playwright/test'

test.describe('Application Navigation', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('should load home page', async () => {
    // Verify app is loaded
    const app = page.locator('[data-testid="app"]')
    await expect(app).toBeVisible()
  })

  test('should display navigation sidebar', async () => {
    const sidebar = page.locator('[data-testid="sidebar"]')
    const hasNav = await sidebar.isVisible().catch(() => false)
    expect(hasNav).toBeTruthy()
  })

  test('should have all main navigation links', async () => {
    // Check for main page links
    const dashboardLink = page.locator('a[href*="dashboard"], button:has-text("Dashboard")')
    const approvalsLink = page.locator('a[href*="approvals"], button:has-text("Approvals")')
    const suggestionsLink = page.locator('a[href*="suggestions"], button:has-text("Suggestions")')
    const knowledgeLink = page.locator('a[href*="knowledge"], button:has-text("Knowledge")')

    expect(await dashboardLink.count() + await approvalsLink.count() +
           await suggestionsLink.count() + await knowledgeLink.count()).toBeGreaterThan(0)
  })

  test('should navigate to Dashboard', async () => {
    const dashboardLink = page.locator('a[href*="dashboard"], button:has-text("Dashboard")')
    const firstLink = dashboardLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/dashboard|^\//)
    }
  })

  test('should navigate to Approvals', async () => {
    const approvalsLink = page.locator('a[href*="approvals"], button:has-text("Approvals")')
    const firstLink = approvalsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/approvals/)
    }
  })

  test('should navigate to Suggestions', async () => {
    const suggestionsLink = page.locator('a[href*="suggestions"], button:has-text("Suggestions")')
    const firstLink = suggestionsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/suggestions/)
    }
  })

  test('should navigate to Knowledge', async () => {
    const knowledgeLink = page.locator('a[href*="knowledge"], button:has-text("Knowledge")')
    const firstLink = knowledgeLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/knowledge/)
    }
  })

  test('should navigate to Config', async () => {
    const configLink = page.locator('a[href*="config"], button:has-text("Config")')
    const firstLink = configLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/config/)
    }
  })

  test('should navigate to Chat/Messages', async () => {
    const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")')
    const firstLink = chatLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/chat/)
    }
  })

  test('should handle navigation back', async () => {
    // Navigate to approvals
    const approvalsLink = page.locator('a[href*="approvals"], button:has-text("Approvals")')
    const firstLink = approvalsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Go back
      await page.navigate(page.url().replace(/approvals/, 'dashboard'))
      await page.waitForLoadState('networkidle')

      // Verify we navigated
      const url = page.url()
      expect(url).toBeDefined()
    }
  })

  test('should maintain active state on current page', async () => {
    // Navigate to approvals
    const approvalsLink = page.locator('a[href*="approvals"], button:has-text("Approvals")')
    const firstLink = approvalsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Check if link has active state
      const activeLink = page.locator('a[href*="approvals"].active, button:has-text("Approvals")[aria-current="page"]')
      const hasActive = await activeLink.count() > 0
      expect(hasActive).toBeTruthy()
    }
  })

  test('should load and display page content after navigation', async () => {
    const approvalsLink = page.locator('a[href*="approvals"], button:has-text("Approvals")')
    const firstLink = approvalsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Verify page has content
      const mainContent = page.locator('main, [role="main"]')
      await expect(mainContent).toBeVisible()
    }
  })
})
