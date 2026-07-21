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

  test('skill cards navigate to the skill detail page', async ({ page }) => {
    const card = page.getByRole('link', { name: /^pdf/ }).first();
    await expect(card).toHaveAttribute('href', '/skills/anthropic/pdf');
    await expect(card).not.toHaveAttribute('target', '_blank');
  });
});

// ── Skill detail page (file browser) ────────────────────────────────────────

test.describe('Skill detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Skills' }).click();
    await page.getByRole('link', { name: /^pdf/ }).first().click();
  });

  test('renders skill heading and repo GitHub link', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'pdf', level: 1 })).toBeVisible();
    await expect(page.getByTestId('repo-github-link')).toHaveAttribute(
      'href',
      'https://github.com/anthropics/skills/tree/main/skills/pdf',
    );
  });

  test('file tree lists the skill files', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'SKILL.md' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'reference.md' })).toBeVisible();
  });

  test('SKILL.md is selected by default and its content loads', async ({ page }) => {
    // Content is fetched live from GitHub's raw CDN, so give the network
    // request more headroom than the default UI-interaction assertions.
    test.setTimeout(30_000);
    await expect(page.getByTestId('viewer-path')).toHaveText('SKILL.md');
    await expect(page.getByTestId('viewer-body')).toContainText('PDF', { timeout: 20_000 });
  });

  test('clicking another file swaps the preview and its GitHub link', async ({ page }) => {
    await page.getByRole('button', { name: 'reference.md' }).click();
    await expect(page.getByTestId('viewer-path')).toHaveText('reference.md');
    await expect(page.getByTestId('viewer-github-link')).toHaveAttribute(
      'href',
      'https://github.com/anthropics/skills/blob/main/skills/pdf/reference.md',
    );
  });

  test('breadcrumb link returns to the Skills Library', async ({ page }) => {
    await page.getByRole('link', { name: 'Skills Library' }).click();
    await expect(page.getByRole('heading', { name: 'Skills Library', level: 1 })).toBeVisible();
  });
});
