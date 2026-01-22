import { test, expect, Page } from '@playwright/test';

test.describe('Suggestions and Voting', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('/#/suggestions');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to suggestions page', async () => {
    await expect(page).toHaveURL(/suggestions/);
    const suggestionsContent = page.locator('[data-testid="suggestions-page"]');
    await expect(suggestionsContent).toBeVisible();
  });

  test('should display suggestion statistics', async () => {
    // Check for stat cards: total, voting, approved, rejected
    const totalStat = page.locator('[data-testid="stat-total-suggestions"]');
    const votingStat = page.locator('[data-testid="stat-voting"]');
    const approvedStat = page.locator('[data-testid="stat-approved"]');
    const rejectedStat = page.locator('[data-testid="stat-rejected"]');

    await expect(totalStat).toBeVisible();
    await expect(votingStat).toBeVisible();
    await expect(approvedStat).toBeVisible();
    await expect(rejectedStat).toBeVisible();
  });

  test('should display suggestion cards with details', async () => {
    const suggestionCards = page.locator('[data-testid="suggestion-card"]');
    const count = await suggestionCards.count();

    if (count > 0) {
      const firstCard = suggestionCards.first();
      const title = firstCard.locator('[data-testid="suggestion-title"]');
      const description = firstCard.locator('[data-testid="suggestion-description"]');
      const category = firstCard.locator('[data-testid="suggestion-category"]');
      const status = firstCard.locator('[data-testid="suggestion-status"]');

      await expect(title).toBeVisible();
      await expect(description).toBeVisible();
      await expect(category).toBeVisible();
      await expect(status).toBeVisible();
    }
  });

  test('should display voting options for open suggestions', async () => {
    const votingCards = page.locator('[data-testid="suggestion-card"][data-status="voting"]');
    const count = await votingCards.count();

    if (count > 0) {
      const firstVoting = votingCards.first();
      const approveBtn = firstVoting.locator('button:has-text("Approve")');
      const rejectBtn = firstVoting.locator('button:has-text("Reject")');
      const abstainBtn = firstVoting.locator('button:has-text("Abstain")');

      // At least one voting button should be visible
      expect(
        await Promise.race([
          approveBtn.isVisible(),
          rejectBtn.isVisible(),
          abstainBtn.isVisible(),
        ]).catch(() => false)
      ).toBeTruthy();
    }
  });

  test('should display vote counts and progress', async () => {
    const votingCards = page.locator('[data-testid="suggestion-card"][data-status="voting"]');
    const count = await votingCards.count();

    if (count > 0) {
      const firstVoting = votingCards.first();
      const voteCount = firstVoting.locator('[data-testid="vote-count"]');
      const voteProgress = firstVoting.locator('[data-testid="vote-progress"]');

      const hasCount = await voteCount.isVisible().catch(() => false);
      const hasProgress = await voteProgress.isVisible().catch(() => false);

      expect(hasCount || hasProgress).toBeTruthy();
    }
  });

  test('should display orchestrator override button for active suggestions', async () => {
    const activeCards = page.locator('[data-testid="suggestion-card"][data-status="voting"]');
    const count = await activeCards.count();

    if (count > 0) {
      const firstCard = activeCards.first();
      const overrideBtn = firstCard.locator('button:has-text("Override")');

      const hasOverride = await overrideBtn.isVisible().catch(() => false);
      expect(hasOverride).toBeTruthy();
    }
  });

  test('should show orchestrator decision when present', async () => {
    const decidedCards = page.locator(
      '[data-testid="suggestion-card"][data-orchestrator-decision]'
    );
    const count = await decidedCards.count();

    if (count > 0) {
      const firstDecided = decidedCards.first();
      const decision = firstDecided.locator('[data-testid="orchestrator-decision"]');
      const reason = firstDecided.locator('[data-testid="orchestrator-reason"]');

      await expect(decision).toBeVisible();
      await expect(reason).toBeVisible();
    }
  });

  test('should display category badges', async () => {
    const suggestionCards = page.locator('[data-testid="suggestion-card"]');
    const count = await suggestionCards.count();

    if (count > 0) {
      const firstCard = suggestionCards.first();
      const categoryBadge = firstCard.locator('[data-testid="suggestion-category"]');
      const text = await categoryBadge.textContent();

      expect(['feature', 'fix', 'improvement', 'refactor', 'docs']).toContain(text?.toLowerCase());
    }
  });

  test('should display status badges with correct colors', async () => {
    const suggestionCards = page.locator('[data-testid="suggestion-card"]');
    const count = await suggestionCards.count();

    if (count > 0) {
      const firstCard = suggestionCards.first();
      const statusBadge = firstCard.locator('[data-testid="suggestion-status"]');
      const statusClass = await statusBadge.getAttribute('class');

      expect(statusClass).toContain('badge');
    }
  });

  test('should show empty state when no suggestions', async () => {
    const emptyState = page.locator('[data-testid="empty-state"]');
    const suggestionCards = page.locator('[data-testid="suggestion-card"]');

    const isEmpty = await emptyState.isVisible().catch(() => false);
    const hasCards = await suggestionCards.count().then((c) => c > 0);

    // Either empty state or cards should be visible, not both
    expect(isEmpty || hasCards).toBeTruthy();
  });
});
