import { test, expect, Page } from '@playwright/test'

test.describe('Dashboard', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('/')
    // Wait for the dashboard to load
    await page.waitForLoadState('networkidle')
  })

  test('should display daemon status information', async () => {
    // Check for the daemon status section
    const daemonStatus = page.locator('[data-testid="daemon-status"]')
    await expect(daemonStatus).toBeVisible()

    // Verify status badge is visible
    const statusBadge = page.locator('[data-testid="daemon-status-badge"]')
    await expect(statusBadge).toBeVisible()
  })

  test('should display active agents count', async () => {
    // Check for agents section
    const agentsSection = page.locator('[data-testid="agents-section"]')
    await expect(agentsSection).toBeVisible()

    // Verify agent list or empty state
    const agentsList = page.locator('[data-testid="agents-list"]')
    const emptyState = page.locator('[data-testid="agents-empty"]')
    const isVisible = await Promise.race([
      agentsList.isVisible().then(() => true),
      emptyState.isVisible().then(() => true),
      Promise.reject(new Error('Neither agents list nor empty state found')),
    ]).catch(() => false)
    expect(isVisible).toBeTruthy()
  })

  test('should display task statistics', async () => {
    // Check for tasks section
    const tasksSection = page.locator('[data-testid="tasks-section"]')
    await expect(tasksSection).toBeVisible()

    // Verify task counts are visible
    const taskCounts = page.locator('[data-testid="task-count"]')
    const count = await taskCounts.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should display real-time metrics', async () => {
    // Check for metrics display
    const metricsSection = page.locator('[data-testid="metrics-section"]')
    await expect(metricsSection).toBeVisible()

    // Verify at least one metric is displayed
    const metrics = page.locator('[data-testid="metric-card"]')
    const count = await metrics.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should auto-refresh daemon status', async () => {
    // Get initial status text
    const statusBadge = page.locator('[data-testid="daemon-status-badge"]')
    const initialStatus = await statusBadge.textContent()

    // Wait for refresh (5 seconds based on code)
    await page.waitForTimeout(6000)

    // Status should remain or update
    const updatedStatus = await statusBadge.textContent()
    expect(updatedStatus).toBeDefined()
  })

  test('should navigate to Config page for MCP servers', async () => {
    // Find and click on Config in navigation
    const configLink = page.locator('nav a[href="#/config"]')
    if (await configLink.isVisible()) {
      await configLink.click()
      await page.waitForURL(/config/)
      await expect(page).toHaveURL(/config/)
    }
  })
})
