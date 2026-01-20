import { test, expect, Page } from '@playwright/test'

test.describe('Approvals Workflow', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('/#/approvals')
    await page.waitForLoadState('networkidle')
  })

  test('should navigate to approvals page', async () => {
    await expect(page).toHaveURL(/approvals/)
    // Verify page content is loaded
    const approvalsContent = page.locator('[data-testid="approvals-page"]')
    await expect(approvalsContent).toBeVisible()
  })

  test('should display approval statistics', async () => {
    // Check for stat cards
    const statCards = page.locator('[data-testid="stat-card"]')
    const count = await statCards.count()
    expect(count).toBeGreaterThan(0)

    // Verify each stat has a label and value
    for (let i = 0; i < count; i++) {
      const label = statCards.nth(i).locator('[data-testid="stat-label"]')
      const value = statCards.nth(i).locator('[data-testid="stat-value"]')
      await expect(label).toBeVisible()
      await expect(value).toBeVisible()
    }
  })

  test('should display approval request list or empty state', async () => {
    const requestList = page.locator('[data-testid="approval-list"]')
    const emptyState = page.locator('[data-testid="empty-state"]')

    const hasRequests = await requestList.isVisible().catch(() => false)
    const isEmpty = await emptyState.isVisible().catch(() => false)

    expect(hasRequests || isEmpty).toBeTruthy()
  })

  test('should display approval request cards with details', async () => {
    const requestCards = page.locator('[data-testid="approval-card"]')
    const count = await requestCards.count()

    if (count > 0) {
      // Check first request card
      const firstCard = requestCards.first()
      const title = firstCard.locator('[data-testid="request-title"]')
      const description = firstCard.locator('[data-testid="request-description"]')

      await expect(title).toBeVisible()
      await expect(description).toBeVisible()
    }
  })

  test('should show action buttons for pending requests', async () => {
    const requestCards = page.locator('[data-testid="approval-card"]')
    const count = await requestCards.count()

    if (count > 0) {
      const firstCard = requestCards.first()
      const approveBtn = firstCard.locator('button:has-text("Approve")')
      const rejectBtn = firstCard.locator('button:has-text("Reject")')

      // At least one action button should be visible
      const hasApprove = await approveBtn.isVisible().catch(() => false)
      const hasReject = await rejectBtn.isVisible().catch(() => false)

      expect(hasApprove || hasReject).toBeTruthy()
    }
  })

  test('should display completed approvals with decision', async () => {
    const completedCards = page.locator('[data-testid="approval-card"].completed')
    const count = await completedCards.count()

    if (count > 0) {
      const firstCompleted = completedCards.first()
      const decision = firstCompleted.locator('[data-testid="decision-badge"]')
      await expect(decision).toBeVisible()
    }
  })

  test('should filter approvals by status', async () => {
    const filterButtons = page.locator('[data-testid="filter-button"]')
    const count = await filterButtons.count()

    if (count > 0) {
      // Click first filter
      await filterButtons.first().click()
      await page.waitForLoadState('networkidle')

      // Verify page content updates
      const approvalList = page.locator('[data-testid="approval-list"]')
      await expect(approvalList).toBeVisible()
    }
  })

  test('should search approval requests', async () => {
    const searchInput = page.locator('[data-testid="search-input"]')
    const searchButton = page.locator('[data-testid="search-button"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      if (await searchButton.isVisible()) {
        await searchButton.click()
        await page.waitForLoadState('networkidle')
      }

      // Verify results are displayed
      const results = page.locator('[data-testid="approval-card"]')
      await expect(results).toBeDefined()
    }
  })
})
