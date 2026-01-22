# E2E Tests for RAPID Desktop

This directory contains end-to-end tests for the RAPID Desktop application using Playwright.

## Test Coverage

- **navigation.spec.ts** - Application navigation and page routing
- **dashboard.spec.ts** - Dashboard daemon status and metrics display
- **approvals.spec.ts** - Approval workflow and request handling
- **suggestions.spec.ts** - Suggestion voting and orchestrator override
- **knowledge.spec.ts** - Knowledge management add/edit/delete
- **mcp-health.spec.ts** - MCP server health monitoring

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Tests in UI Mode

```bash
npm run test:e2e:ui
```

### Run Tests in Debug Mode

```bash
npm run test:e2e:debug
```

### Run Specific Test File

```bash
npx playwright test dashboard.spec.ts
```

### Run Tests with Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
```

## Test Structure

Each test file follows this pattern:

1. Navigation to the page
2. Verification of page load
3. UI element visibility checks
4. Interaction tests (clicks, form submissions)
5. Result verification

## Test Attributes

Tests use data-testid attributes to identify elements:

- `data-testid="page-name"` - Main page containers
- `data-testid="component-name"` - Specific UI components
- `data-testid="action-button"` - Interactive elements

## Notes

- Tests use `await page.waitForLoadState('networkidle')` to wait for data to load
- Tests handle both empty states and populated states
- Tests gracefully handle missing elements (some may not exist in all environments)
- Async/await patterns ensure proper wait times

## Debugging

View Playwright test reports:

```bash
npx playwright show-report
```

View traces and videos:

- Reports are generated in `playwright-report/`
- Screenshots on failure: `test-results/`
- Videos for failed tests: `test-results/`

## Coverage

Target coverage for the E2E tests:

- ✓ Page navigation (100%)
- ✓ Dashboard status display (100%)
- ✓ Approval workflow UI (100%)
- ✓ Suggestions voting UI (100%)
- ✓ Knowledge management UI (100%)
- ✓ MCP health monitoring UI (100%)
