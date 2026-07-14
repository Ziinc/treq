import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Docs sidebar' });
const footer = (page: Page) => page.getByRole('contentinfo');

test.describe('Homepage Features layout', () => {
  test('review screenshot keeps aspect ratio and takes most of the row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const features = page.getByRole('region', { name: 'Features' });
    await expect(features.getByRole('heading', { name: 'Features', level: 2 })).toBeVisible();

    const screenshot = features.getByRole('img', {
      name: 'Treq code review screenshot showing comments sent to Claude',
    });
    await screenshot.scrollIntoViewIfNeeded();

    const box = await screenshot.boundingBox();
    expect(box).not.toBeNull();

    // Intrinsic size comes from the HTML width/height attrs on the <img>.
    const naturalWidth = Number(await screenshot.getAttribute('width'));
    const naturalHeight = Number(await screenshot.getAttribute('height'));
    expect(naturalWidth).toBeGreaterThan(0);
    expect(naturalHeight).toBeGreaterThan(0);

    // Regression: HTML width/height attrs without CSS height:auto left the
    // image at intrinsic height (1749px) while width shrank, stretching it.
    const renderedAspect = box!.width / box!.height;
    const naturalAspect = naturalWidth / naturalHeight;
    expect(Math.abs(renderedAspect - naturalAspect)).toBeLessThan(0.05);
    expect(box!.height).toBeLessThan(naturalHeight * 0.5);

    // Screenshot is 2fr of a 1fr/2fr row inside the Features section (~2/3 width).
    const featuresBox = await features.boundingBox();
    expect(featuresBox).not.toBeNull();
    expect(box!.width / featuresBox!.width).toBeGreaterThanOrEqual(0.55);
  });
});

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
    await expect(page.getByRole('heading', { name: /Treq.*Review and manage agent branch state/, level: 1 })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: /Treq.*Review and manage agent branch state/, level: 1 })).toBeVisible();
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
});
