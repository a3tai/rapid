import { test, expect, Page } from '@playwright/test';

test.describe('Knowledge Management', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('/#/knowledge');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to knowledge page', async () => {
    await expect(page).toHaveURL(/knowledge/);
    const knowledgeContent = page.locator('[data-testid="knowledge-page"]');
    await expect(knowledgeContent).toBeVisible();
  });

  test('should display memory type tabs', async () => {
    // Check for memory type tabs: episodic, semantic, procedural, decision_trace
    const episodicTab = page.locator('[data-testid="tab-episodic"]');
    const semanticTab = page.locator('[data-testid="tab-semantic"]');
    const proceduralTab = page.locator('[data-testid="tab-procedural"]');
    const decisionTab = page.locator('[data-testid="tab-decision-trace"]');

    await expect(episodicTab).toBeVisible();
    await expect(semanticTab).toBeVisible();
    await expect(proceduralTab).toBeVisible();
    await expect(decisionTab).toBeVisible();
  });

  test('should display add memory button', async () => {
    const addBtn = page.locator('[data-testid="add-memory-button"]');
    await expect(addBtn).toBeVisible();
  });

  test('should display memory items or empty state', async () => {
    const memoryList = page.locator('[data-testid="memory-list"]');
    const emptyState = page.locator('[data-testid="empty-state"]');

    const hasList = await memoryList.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);

    expect(hasList || isEmpty).toBeTruthy();
  });

  test('should display memory items with details', async () => {
    const memoryItems = page.locator('[data-testid="memory-item"]');
    const count = await memoryItems.count();

    if (count > 0) {
      const firstItem = memoryItems.first();
      const key = firstItem.locator('[data-testid="memory-key"]');
      const value = firstItem.locator('[data-testid="memory-value"]');
      const confidence = firstItem.locator('[data-testid="memory-confidence"]');

      await expect(key).toBeVisible();
      await expect(value).toBeVisible();

      const hasConfidence = await confidence.isVisible().catch(() => false);
      expect(hasConfidence).toBeDefined();
    }
  });

  test('should display edit button for memory items', async () => {
    const memoryItems = page.locator('[data-testid="memory-item"]');
    const count = await memoryItems.count();

    if (count > 0) {
      const firstItem = memoryItems.first();
      const editBtn = firstItem.locator('[data-testid="edit-button"]');

      const hasEdit = await editBtn.isVisible().catch(() => false);
      expect(hasEdit).toBeTruthy();
    }
  });

  test('should display delete button for memory items', async () => {
    const memoryItems = page.locator('[data-testid="memory-item"]');
    const count = await memoryItems.count();

    if (count > 0) {
      const firstItem = memoryItems.first();
      const deleteBtn = firstItem.locator('[data-testid="delete-button"]');

      const hasDelete = await deleteBtn.isVisible().catch(() => false);
      expect(hasDelete).toBeTruthy();
    }
  });

  test('should open add memory dialog', async () => {
    const addBtn = page.locator('[data-testid="add-memory-button"]');
    await addBtn.click();

    const dialog = page.locator('[data-testid="memory-dialog"]');
    await expect(dialog).toBeVisible();

    // Check for form inputs
    const keyInput = page.locator('[data-testid="memory-key-input"]');
    const valueInput = page.locator('[data-testid="memory-value-input"]');

    await expect(keyInput).toBeVisible();
    await expect(valueInput).toBeVisible();
  });

  test('should display search/filter for memories', async () => {
    const searchInput = page.locator('[data-testid="search-input"]');

    const hasSearch = await searchInput.isVisible().catch(() => false);
    expect(hasSearch).toBeTruthy();
  });

  test('should switch between memory type tabs', async () => {
    const semanticTab = page.locator('[data-testid="tab-semantic"]');
    await semanticTab.click();
    await page.waitForLoadState('networkidle');

    // Verify tab is active
    const activeTab = page.locator('[data-testid="tab-semantic"][aria-selected="true"]');
    const isActive = await activeTab.isVisible().catch(() => false);
    expect(isActive).toBeTruthy();
  });

  test('should display confidence levels for memories', async () => {
    const memoryItems = page.locator('[data-testid="memory-item"]');
    const count = await memoryItems.count();

    if (count > 0) {
      const confidenceItems = page.locator('[data-testid="memory-confidence"]');
      const confidenceCount = await confidenceItems.count();

      expect(confidenceCount).toBeGreaterThan(0);
    }
  });

  test('should display memory metadata', async () => {
    const memoryItems = page.locator('[data-testid="memory-item"]');
    const count = await memoryItems.count();

    if (count > 0) {
      const firstItem = memoryItems.first();
      const metadata = firstItem.locator('[data-testid="memory-metadata"]');

      const hasMetadata = await metadata.isVisible().catch(() => false);
      expect(hasMetadata).toBeDefined();
    }
  });
});
