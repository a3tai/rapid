import { Page, expect } from '@playwright/test'

/**
 * Common test helpers for E2E tests
 */

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle')
}

export async function navigateToPage(page: Page, path: string) {
  await page.goto(`/#${path}`)
  await waitForPageLoad(page)
}

export async function expectPageUrl(page: Page, urlPattern: RegExp | string) {
  if (typeof urlPattern === 'string') {
    await expect(page).toHaveURL(new RegExp(urlPattern))
  } else {
    await expect(page).toHaveURL(urlPattern)
  }
}

export async function findByText(page: Page, text: string, role?: string) {
  if (role) {
    return page.locator(`[role="${role}"]:has-text("${text}")`)
  }
  return page.locator(`:has-text("${text}")`)
}

export async function findByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`)
}

export async function isElementVisible(page: Page, locator: string) {
  try {
    return await page.locator(locator).isVisible()
  } catch {
    return false
  }
}

export async function clickButton(page: Page, text: string) {
  const button = page.locator(`button:has-text("${text}")`)
  if (await button.isVisible()) {
    await button.click()
    await waitForPageLoad(page)
  }
}

export async function fillInput(page: Page, testId: string, value: string) {
  const input = findByTestId(page, testId)
  if (await input.isVisible()) {
    await input.fill(value)
  }
}

export async function expectElementCount(page: Page, testId: string, expectedCount: number) {
  const elements = findByTestId(page, testId)
  const count = await elements.count()
  expect(count).toEqual(expectedCount)
}

export async function expectElementExists(page: Page, testId: string) {
  const element = findByTestId(page, testId)
  const count = await element.count()
  expect(count).toBeGreaterThan(0)
}

export async function expectElementNotExists(page: Page, testId: string) {
  const element = findByTestId(page, testId)
  const count = await element.count()
  expect(count).toEqual(0)
}

export async function getTextContent(page: Page, testId: string) {
  const element = findByTestId(page, testId)
  if (await element.isVisible()) {
    return await element.textContent()
  }
  return null
}

export async function waitForElement(page: Page, testId: string, timeout = 5000) {
  const element = findByTestId(page, testId)
  await element.waitFor({ state: 'visible', timeout })
  return element
}

export async function switchTab(page: Page, tabTestId: string) {
  const tab = findByTestId(page, tabTestId)
  if (await tab.isVisible()) {
    await tab.click()
    await waitForPageLoad(page)
  }
}
