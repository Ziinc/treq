import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Docs sidebar' });
const footer = (page: Page) => page.getByRole('contentinfo');

test.describe('Navbar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Guides link navigates to guides section', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Guides' }).click();
    await expect(page.getByRole('heading', { name: 'User Guides', level: 1 })).toBeVisible();
  });

  test('Reference link navigates to reference section', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Reference' }).click();
    await expect(page.getByRole('heading', { name: 'Treq', level: 1 })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'CLI' })).toBeVisible();
  });

  test('Get Started button navigates to installation page', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Get Started' }).click();
    await expect(page.getByRole('heading', { name: 'Installation', level: 1 })).toBeVisible();
  });

  test('logo navigates to home from a docs page', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Guides' }).click();
    await nav(page).getByRole('link', { name: 'Treq Logo' }).click();
    await expect(page.getByRole('heading', { name: 'AI Coding Manager', level: 1 })).toBeVisible();
  });

  test('GitHub link points to the correct repo', async ({ page }) => {
    const githubLink = nav(page).getByRole('link', { name: 'GitHub' });
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/Ziinc/treq');
  });
});

test.describe('Guides sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Guides' }).click();
  });

  test('Getting Started items are visible by default', async ({ page }) => {
    await expect(sidebar(page).getByRole('link', { name: 'Installation' })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Creating Workspaces' })).toBeVisible();
  });

  test('navigates to Installation page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Installation' }).click();
    await expect(page.getByRole('heading', { name: 'Installation', level: 1 })).toBeVisible();
  });

  test('navigates to Creating Workspaces page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Creating Workspaces' }).click();
    await expect(page.getByRole('heading', { name: 'Creating Workspaces', level: 1 })).toBeVisible();
  });

  test('expands Core Workflows and navigates to Committing Changes', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Core Workflows' }).click();
    await sidebar(page).getByRole('link', { name: 'Committing Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Committing Changes', level: 1 })).toBeVisible();
  });

  test('expands Core Workflows and navigates to Code Review Workflow', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Core Workflows' }).click();
    await sidebar(page).getByRole('link', { name: 'Code Review Workflow' }).click();
    await expect(page.getByRole('heading', { name: 'Code Review Workflow', level: 1 })).toBeVisible();
  });

  test('expands Common Tasks and navigates to Pushing to Remote', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Common Tasks' }).click();
    await sidebar(page).getByRole('link', { name: 'Pushing to Remote' }).click();
    await expect(page.getByRole('heading', { name: 'Pushing to Remote', level: 1 })).toBeVisible();
  });

  test('expands Tips & Tricks and navigates to Customizing Settings', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Tips & Tricks' }).click();
    await sidebar(page).getByRole('link', { name: 'Customizing Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Customizing Settings', level: 1 })).toBeVisible();
  });
});

test.describe('Reference sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Reference' }).click();
  });

  test('Workspaces link navigates to workspaces page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Workspaces' }).click();
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  });

  test('Commit Management sub-item navigates correctly', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Commits Management' }).click();
    await expect(page.getByRole('heading', { name: 'Commits Management', level: 1 })).toBeVisible();
  });

  test('navigates to CLI page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'CLI' }).click();
    await expect(page.getByRole('heading', { name: 'CLI', level: 1 })).toBeVisible();
  });

  test('navigates to Keyboard Shortcuts page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Keyboard Shortcuts' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts', level: 1 })).toBeVisible();
  });

  test('navigates to Contributing page', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: 'Contributing' }).click();
    await expect(page.getByRole('heading', { name: 'Contributing', level: 1 })).toBeVisible();
  });
});

test.describe('Cross-section navigation', () => {
  test('switches from Guides to Reference via navbar', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Guides' }).click();
    await nav(page).getByRole('link', { name: 'Reference' }).click();
    await expect(page.getByRole('heading', { name: 'Treq', level: 1 })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'CLI' })).toBeVisible();
  });

  test('switches from Reference to Guides via navbar', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Reference' }).click();
    await nav(page).getByRole('link', { name: 'Guides' }).click();
    await expect(page.getByRole('heading', { name: 'User Guides', level: 1 })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Installation' })).toBeVisible();
  });

  test('logo returns to home from an inner docs page', async ({ page }) => {
    await page.goto('/');
    await nav(page).getByRole('link', { name: 'Guides' }).click();
    await sidebar(page).getByRole('link', { name: 'Installation' }).click();
    await nav(page).getByRole('link', { name: 'Treq Logo' }).click();
    await expect(page.getByRole('heading', { name: 'AI Coding Manager', level: 1 })).toBeVisible();
  });
});

test.describe('Footer navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Getting Started footer link navigates to installation page', async ({ page }) => {
    await footer(page).getByRole('link', { name: 'Getting Started' }).click();
    await expect(page.getByRole('heading', { name: 'Installation', level: 1 })).toBeVisible();
  });

  test('Guides footer link navigates to guides overview', async ({ page }) => {
    await footer(page).getByRole('link', { name: 'Guides' }).click();
    await expect(page.getByRole('heading', { name: 'User Guides', level: 1 })).toBeVisible();
  });

  test('Features footer link navigates to workspaces page', async ({ page }) => {
    await footer(page).getByRole('link', { name: 'Features' }).click();
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  });
});
