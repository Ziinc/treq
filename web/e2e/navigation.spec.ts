import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Docs sidebar' });
const footer = (page: Page) => page.getByRole('contentinfo');

test.describe('Navbar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Learn link navigates to learn section', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('Docs link navigates to docs section', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await expect(page.getByRole('heading', { name: 'Treq', level: 1 })).toBeVisible();
  });

  test('Get Started button navigates to installation page', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Get Started' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('logo navigates home from a docs page', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await nav(page).getByRole('link', { name: 'Treq Logo' }).click();
    await expect(page.getByRole('heading', { name: 'AI Workspace Manager', level: 1 })).toBeVisible();
  });

  test('GitHub link points to the correct repo', async ({ page }) => {
    await expect(nav(page).getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/Ziinc/treq');
  });
});

test.describe('Docs sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
  });

  test('Getting Started items are visible by default', async ({ page }) => {
    await expect(sidebar(page).getByRole('link', { name: 'Installation' })).toBeVisible();
  });

  test('navigates to Installation page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Installation' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('expands Concepts and navigates to Workspaces', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Concepts' }).click();
    await sidebar(page).getByRole('link', { name: 'Workspaces' }).click();
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  });

  test('expands Reference and navigates to CLI', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Reference' }).click();
    await sidebar(page).getByRole('link', { name: 'CLI' }).click();
    await expect(page.getByRole('heading', { name: 'CLI', level: 1 })).toBeVisible();
  });

  test('expands Reference and navigates to Keyboard Shortcuts', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Reference' }).click();
    await sidebar(page).getByRole('link', { name: 'Keyboard Shortcuts' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts', level: 1 })).toBeVisible();
  });
});

test.describe('Learn sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
  });

  test('expands Tutorials and navigates to Committing Changes', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Tutorials' }).click();
    await sidebar(page).getByRole('link', { name: 'Committing Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Committing Changes', level: 1 })).toBeVisible();
  });

  test('expands How-To and navigates to Pushing to Remote', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'How-To' }).click();
    await sidebar(page).getByRole('link', { name: 'Pushing to Remote' }).click();
    await expect(page.getByRole('heading', { name: 'Pushing to Remote', level: 1 })).toBeVisible();
  });
});

test.describe('Cross-section navigation', () => {
  test('switches from Learn to Docs via navbar', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await expect(page.getByRole('heading', { name: 'Treq', level: 1 })).toBeVisible();
  });

  test('switches from Docs to Learn via navbar', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('logo returns home from an inner page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Installation' }).click();
    await nav(page).getByRole('link', { name: 'Treq Logo' }).click();
    await expect(page.getByRole('heading', { name: 'AI Workspace Manager', level: 1 })).toBeVisible();
  });
});

test.describe('Footer navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Getting Started footer link navigates to installation page', async ({ page }) => {
    await footer(page).getByRole('link', { name: 'Getting Started' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('Learn footer link navigates to learn section', async ({ page }) => {
    await footer(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('GitHub footer link points to the correct repo', async ({ page }) => {
    await expect(footer(page).getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/Ziinc/treq');
  });
});
