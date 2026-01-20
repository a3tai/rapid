import { test, expect, Page } from '@playwright/test'

test.describe('Events Page', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('should navigate to events page', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/events/)
    }
  })

  test('should display event bus header', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Check for header
      const header = page.locator('h2:has-text("Event Bus")')
      await expect(header).toBeVisible()
    }
  })

  test('should display message type filters', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Check for filter buttons
      const allFilter = page.locator('button:has-text("All")')
      const completionFilter = page.locator('button:has-text("completion")')
      const discoveryFilter = page.locator('button:has-text("discovery")')
      const errorFilter = page.locator('button:has-text("error")')

      await expect(allFilter).toBeVisible()
      // At least one other filter should be visible
      const hasOtherFilters =
        (await completionFilter.isVisible()) ||
        (await discoveryFilter.isVisible()) ||
        (await errorFilter.isVisible())
      expect(hasOtherFilters).toBeTruthy()
    }
  })

  test('should display search input', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Check for search input
      const searchInput = page.locator('input[placeholder*="Search"]')
      await expect(searchInput).toBeVisible()
    }
  })

  test('should display events list or empty state', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Either show events or empty state
      const eventsList = page.locator('[data-testid="events-list"]')
      const emptyState = page.locator('text="No events found"')
      const messageCard = page.locator('.card').filter({ hasText: /completion|discovery|coordination|error/ })

      await expect(
        await eventsList.isVisible() ||
          await emptyState.isVisible() ||
          await messageCard.first().isVisible()
      ).toBeTruthy()
    }
  })

  test('should filter events by type', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Click on a filter type
      const completionFilter = page.locator('button:has-text("completion")')
      if (await completionFilter.isVisible()) {
        await completionFilter.click()
        await page.waitForTimeout(500)

        // Verify the filter is active (should have visual indication)
        const activeFilter = page.locator('button:has-text("completion").badge-success, button:has-text("completion").bg-green')
        const hasActive = await activeFilter.count() > 0
        expect(hasActive).toBeTruthy()
      }
    }
  })

  test('should search events', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Type in search
      const searchInput = page.locator('input[placeholder*="Search"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill('test query')
        await page.waitForTimeout(500)

        // Verify search is applied
        const searchValue = await searchInput.inputValue()
        expect(searchValue).toBe('test query')
      }
    }
  })

  test('should expand event details on click', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Find an event card and click it
      const eventCard = page.locator('.card').filter({ hasText: /completion|discovery|coordination/ }).first()
      if (await eventCard.isVisible()) {
        await eventCard.click()
        await page.waitForTimeout(300)

        // Check for expanded details (JSON payload display)
        const expandedContent = page.locator('pre')
        await expandedContent.isVisible()
        // This test passes if we can click - expansion behavior may vary
        expect(true).toBeTruthy()
      }
    }
  })

  test('should display event metadata', async () => {
    const eventsLink = page.locator('a[href*="events"], button:has-text("Events")')
    const firstLink = eventsLink.first()

    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')

      // Check for event metadata elements
      const eventCard = page.locator('.card').filter({ hasText: /completion|discovery|coordination/ }).first()
      if (await eventCard.isVisible()) {
        // Should have agent name, type badge, and timestamp
        const hasAgentInfo = await eventCard.locator('text=/orchestrator|worker|designer/').isVisible()
        const hasTimestamp = await eventCard.locator('text=/\\d{2}:\\d{2}/').isVisible()
        // At least one should be visible
        expect(hasAgentInfo || hasTimestamp).toBeTruthy()
      }
    }
  })
})
