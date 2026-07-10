import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const searchInput = (page: Page) => nav(page).getByRole('searchbox', { name: 'Search documentation' });
const searchDropdown = (page: Page) => page.locator('.navbar').locator('[class*="dropdown"]');

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('search input is visible in the navbar', async ({ page }) => {
    await expect(searchInput(page)).toBeVisible();
  });

  test('typing a query shows results dropdown', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await expect(searchDropdown(page).locator('a').first()).toBeVisible();
  });

  test('results contain the search term', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    const firstResult = searchDropdown(page).locator('a').first();
    const text = await firstResult.textContent();
    expect(text?.toLowerCase()).toContain('workspace');
  });

  test('clicking a result navigates to the correct page', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    const firstLink = searchDropdown(page).locator('a').first();
    await firstLink.click();
    await expect(page).not.toHaveURL('/');
  });

  test('dropdown closes on Escape', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(searchDropdown(page)).not.toBeVisible();
  });

  test('dropdown closes when clicking outside', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await page.mouse.click(10, 10);
    await expect(searchDropdown(page)).not.toBeVisible();
  });

  test('empty query hides results', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await searchInput(page).fill('');
    await expect(searchDropdown(page)).not.toBeVisible();
  });

  test('unmatched query shows no results', async ({ page }) => {
    await searchInput(page).fill('zzzznotarealterm');
    // Wait for debounce + query to settle
    await page.waitForTimeout(1000);
    await expect(searchDropdown(page)).not.toBeVisible();
  });
});
