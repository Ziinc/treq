import { test, expect } from '@playwright/test';

// ── Skills Library (/skills) ────────────────────────────────────────────────

test.describe('Skills Library (/skills)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Skills' }).click();
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Skills Library', level: 1 })).toBeVisible();
  });

  test('lists skill cards from curated sources', async ({ page }) => {
    await expect(page.getByRole('link', { name: /pdf/ }).first()).toBeVisible();
  });

  test('searching narrows the results', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search skills' });
    await search.fill('tdd');
    await expect(page.getByText('of 98 skills')).toBeVisible();
    await expect(page.getByRole('link', { name: /^tdd/ })).toBeVisible();
  });

  test('an unmatched search shows the empty state', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search skills' }).fill('zzzz-not-a-real-skill');
    await expect(page.getByText('No skills match your search.')).toBeVisible();
  });

  test('filtering by source shows only that source', async ({ page }) => {
    await page.getByRole('button', { name: /^Matt Pocock/ }).click();
    await expect(page.getByText(/of 98 skills/)).toBeVisible();
    await expect(page.getByRole('link', { name: /^tdd/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^pdf/ })).toHaveCount(0);
  });

  test('skill cards link to the GitHub source', async ({ page }) => {
    const card = page.getByRole('link', { name: /^pdf/ }).first();
    await expect(card).toHaveAttribute('href', 'https://github.com/anthropics/skills/tree/main/skills/pdf');
    await expect(card).toHaveAttribute('target', '_blank');
  });
});
