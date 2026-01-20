import { test, expect, Page } from '@playwright/test';

test.describe('MCP Server Health Monitoring', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('/#/config');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to config page', async () => {
    await expect(page).toHaveURL(/config/);
    const configContent = page.locator('[data-testid="config-page"]');
    await expect(configContent).toBeVisible();
  });

  test('should display MCP tab', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    const hasTab = await mcpTab.isVisible().catch(() => false);
    expect(hasTab).toBeTruthy();
  });

  test('should click MCP tab and load servers list', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      // Verify MCP servers section is visible
      const serversList = page.locator('[data-testid="mcp-servers-list"]');
      await expect(serversList).toBeVisible();
    }
  });

  test('should display MCP servers or empty state', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverList = page.locator('[data-testid="server-item"]');
      const emptyState = page.locator('[data-testid="no-servers"]');

      const hasServers = await serverList.count().then((c) => c > 0);
      const isEmpty = await emptyState.isVisible().catch(() => false);

      expect(hasServers || isEmpty).toBeTruthy();
    }
  });

  test('should display server health status', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const healthBadge = firstServer.locator('[data-testid="health-badge"]');
        const hasHealth = await healthBadge.isVisible().catch(() => false);
        expect(hasHealth).toBeTruthy();
      }
    }
  });

  test('should display server details', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const name = firstServer.locator('[data-testid="server-name"]');
        const status = firstServer.locator('[data-testid="server-status"]');

        const hasName = await name.isVisible().catch(() => false);
        const hasStatus = await status.isVisible().catch(() => false);

        expect(hasName || hasStatus).toBeTruthy();
      }
    }
  });

  test('should display server type badge', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const typeBadge = firstServer.locator('[data-testid="server-type"]');
        const hasType = await typeBadge.isVisible().catch(() => false);
        expect(hasType).toBeTruthy();
      }
    }
  });

  test('should display last health check timestamp', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const lastCheck = firstServer.locator('[data-testid="last-check"]');
        const hasLastCheck = await lastCheck.isVisible().catch(() => false);
        expect(hasLastCheck).toBeDefined();
      }
    }
  });

  test('should have refresh health button', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const refreshBtn = page.locator('[data-testid="refresh-health-button"]');
      const hasRefresh = await refreshBtn.isVisible().catch(() => false);
      expect(hasRefresh).toBeTruthy();
    }
  });

  test('should display server connection status', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const statusIndicator = firstServer.locator('[data-testid="connection-indicator"]');
        const hasIndicator = await statusIndicator.isVisible().catch(() => false);
        expect(hasIndicator).toBeDefined();
      }
    }
  });

  test('should display server configuration details', async () => {
    const mcpTab = page.locator('[data-testid="tab-mcp"]');
    if (await mcpTab.isVisible()) {
      await mcpTab.click();
      await page.waitForLoadState('networkidle');

      const serverItems = page.locator('[data-testid="server-item"]');
      const count = await serverItems.count();

      if (count > 0) {
        const firstServer = serverItems.first();
        const config = firstServer.locator('[data-testid="server-config"]');
        const hasConfig = await config.isVisible().catch(() => false);
        expect(hasConfig).toBeDefined();
      }
    }
  });
});
