import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Docs sidebar' });
const footer = (page: Page) => page.getByRole('contentinfo');

test.describe('Navbar navigation', () => {
  test('Learn link navigates to learn section', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('Docs link navigates to docs section', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await expect(page.getByRole('heading', { name: 'Treq', level: 1 })).toBeVisible();
  });

  test('Get Started button navigates to installation page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Get Started' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('logo navigates home from a docs page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await nav(page).getByRole('link', { name: 'Treq Logo' }).click();
    await expect(page.getByRole('heading', { name: 'AI Workspace Manager', level: 1 })).toBeVisible();
  });

  test('GitHub link points to the correct repo', async ({ page }) => {
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/Ziinc/treq');
  });

  test('Pricing link navigates to pricing page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Pricing' }).click();
    await expect(page.getByRole('heading', { name: 'Pricing', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro', level: 2 })).toBeVisible();
  });

  test('Roadmap link navigates to roadmap page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Roadmap' }).click();
    await expect(page.getByRole('heading', { name: 'Roadmap', level: 1 })).toBeVisible();
  });
});

test.describe('Docs sidebar navigation', () => {
  test('Installation link is visible by default on Docs overview', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await expect(sidebar(page).getByRole('link', { name: 'Installation' })).toBeVisible();
  });

  test('Installation link navigates to installation page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Installation' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('Concepts link navigates to concepts overview', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Concepts' }).click();
    await expect(page.getByRole('heading', { name: 'Concepts', level: 1 })).toBeVisible();
  });

  test('Workspaces link is visible after navigating into Concepts', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Concepts' }).click();
    await expect(sidebar(page).getByRole('link', { name: 'Workspaces' })).toBeVisible();
  });

  test('Workspaces link navigates to workspaces page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Concepts' }).click();
    await sidebar(page).getByRole('link', { name: 'Workspaces' }).click();
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  });

  test('Reference expands to show CLI link', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('button', { name: 'Reference' }).click();
    await expect(sidebar(page).getByRole('link', { name: 'CLI' })).toBeVisible();
  });

  test('CLI link navigates to CLI page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('button', { name: 'Reference' }).click();
    await sidebar(page).getByRole('link', { name: 'CLI' }).click();
    await expect(page.getByRole('heading', { name: 'CLI', level: 1 })).toBeVisible();
  });

  test('Keyboard Shortcuts link navigates to keyboard shortcuts page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('button', { name: 'Reference' }).click();
    await sidebar(page).getByRole('link', { name: 'Keyboard Shortcuts' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts', level: 1 })).toBeVisible();
  });

  test('Tutorials link navigates to tutorials overview', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Tutorials' }).click();
    await expect(page.getByRole('heading', { name: 'Tutorials', level: 1 })).toBeVisible();
  });

  test('Committing Changes link navigates to committing changes page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Docs' }).click();
    await sidebar(page).getByRole('link', { name: 'Tutorials' }).click();
    await sidebar(page).getByRole('link', { name: 'Committing Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Committing Changes', level: 1 })).toBeVisible();
  });
});

test.describe('Learn sidebar navigation', () => {
  test('Tutorials link navigates to tutorials overview', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await sidebar(page).getByRole('link', { name: 'Tutorials' }).click();
    await expect(page.getByRole('heading', { name: 'Tutorials', level: 1 })).toBeVisible();
  });

  test('Setting Up Claude Code link navigates to Claude Code tutorial', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await sidebar(page).getByRole('link', { name: 'Tutorials' }).click();
    await page.locator('article').getByRole('link', { name: 'Setting Up Claude Code' }).click();
    await expect(page.getByRole('heading', { name: 'Setting Up Claude Code', level: 1 })).toBeVisible();
  });

  test('How-To link navigates to how-to overview', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await sidebar(page).getByRole('link', { name: 'How-To' }).click();
    await expect(page.getByRole('heading', { name: 'How-To Guides', level: 1 })).toBeVisible();
  });

  test('Pushing to Remote link navigates to pushing to remote page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await sidebar(page).getByRole('link', { name: 'How-To' }).click();
    await page.locator('article').getByRole('link', { name: 'Pushing to Remote' }).click();
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
  test('Installation link navigates to installation page', async ({ page }) => {
    await page.goto('/');
    await footer(page).getByRole('link', { name: 'Installation' }).click();
    await expect(page.getByRole('heading', { name: 'Installation and Quickstart', level: 1 })).toBeVisible();
  });

  test('Learn link navigates to learn section', async ({ page }) => {
    await page.goto('/');
    await footer(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('Security and Privacy link navigates to security page', async ({ page }) => {
    await page.goto('/');
    await footer(page).getByRole('link', { name: 'Security and Privacy' }).click();
    await expect(page.getByRole('heading', { name: 'Security and Privacy', level: 1 })).toBeVisible();
  });

  test('GitHub link points to the correct repo', async ({ page }) => {
    await page.goto('/');
    await expect(footer(page).getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/Ziinc/treq');
  });

  test('Pricing link navigates to pricing page', async ({ page }) => {
    await page.goto('/');
    await footer(page).getByRole('link', { name: 'Pricing' }).click();
    await expect(page.getByRole('heading', { name: 'Pricing', level: 1 })).toBeVisible();
  });

  test('Roadmap link navigates to roadmap page', async ({ page }) => {
    await page.goto('/');
    await footer(page).getByRole('link', { name: 'Roadmap' }).click();
    await expect(page.getByRole('heading', { name: 'Roadmap', level: 1 })).toBeVisible();
  });
});
