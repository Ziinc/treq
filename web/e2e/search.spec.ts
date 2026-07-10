import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const searchInput = (page: Page) => nav(page).getByRole('searchbox', { name: 'Search documentation' });
const searchDropdown = (page: Page) => page.locator('[data-testid="search-dropdown"]');

test.describe('Search bar (navbar)', () => {
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
    const text = await searchDropdown(page).locator('a').first().textContent();
    expect(text?.toLowerCase()).toContain('workspace');
  });

  test('dropdown shows "See all results" link', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await expect(searchDropdown(page).getByRole('link', { name: /see all results/i })).toBeVisible();
  });

  test('clicking a result navigates to the correct doc page', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    const firstLink = searchDropdown(page).locator('a').first();
    const href = await firstLink.getAttribute('href');
    await firstLink.click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('pressing Enter navigates to /search with q= param', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await searchInput(page).press('Enter');
    await expect(page).toHaveURL(/\/search\?q=workspace/);
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

  test('clearing the input hides results', async ({ page }) => {
    await searchInput(page).fill('workspace');
    await expect(searchDropdown(page)).toBeVisible({ timeout: 10_000 });
    await searchInput(page).fill('');
    await expect(searchDropdown(page)).not.toBeVisible();
  });

  test('unmatched query shows no dropdown', async ({ page }) => {
    await searchInput(page).fill('zzzznotarealterm');
    await page.waitForTimeout(1000);
    await expect(searchDropdown(page)).not.toBeVisible();
  });
});

test.describe('Search results page (/search)', () => {
  test('shows results for a matching query', async ({ page }) => {
    await page.goto('/search?q=workspace');
    await expect(page.getByRole('heading', { name: /search results for/i })).toBeVisible();
    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 10_000 });
  });

  test('result links navigate to the correct doc page', async ({ page }) => {
    await page.goto('/search?q=workspace');
    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 10_000 });
    const link = page.locator('ul li a').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/(docs|learn)\//);
    await link.click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('shows no-results message for unmatched query', async ({ page }) => {
    await page.goto('/search?q=zzzznotarealterm');
    await expect(page.getByText(/no results found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows result snippets with highlighted terms', async ({ page }) => {
    await page.goto('/search?q=workspace');
    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('ul li mark').first()).toBeVisible();
  });
});
