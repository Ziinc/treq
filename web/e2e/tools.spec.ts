import { test, expect } from '@playwright/test';

// ── Tools index ───────────────────────────────────────────────────────────────

test.describe('Tools index (/tools)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tools' }).click();
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible();
  });

  test('lists the Branch Visualizer card', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Branch Visualizer/ })).toBeVisible();
  });

  test('lists the DAG Visualizer card', async ({ page }) => {
    await expect(page.getByRole('link', { name: /DAG Visualizer/ })).toBeVisible();
  });

  test('Branch Visualizer card navigates to the tool', async ({ page }) => {
    await page.getByRole('link', { name: /Branch Visualizer/ }).click();
    await expect(page.getByRole('heading', { name: 'Branch Visualizer', level: 1 })).toBeVisible();
  });

  test('DAG Visualizer card navigates to the tool', async ({ page }) => {
    await page.getByRole('link', { name: /DAG Visualizer/ }).click();
    await expect(page.getByRole('heading', { name: 'DAG Visualizer', level: 1 })).toBeVisible();
  });
});

// ── Branch Visualizer ─────────────────────────────────────────────────────────

test.describe('Branch Visualizer (/tools/branch-visualizer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tools' }).click();
    await page.getByRole('link', { name: /Branch Visualizer/ }).click();
  });

  test('renders the page title', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Branch Visualizer', level: 1 }),
    ).toBeVisible();
  });

  test('renders an SVG with content', async ({ page }) => {
    // The static HTML already has small SVG icons (width ≤ 30px).
    // rough.js sets width on the canvas SVG to 400+ px; wait for that.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('svg'))
              .some((s) => Number(s.getAttribute('width')) > 100),
      undefined,
      { timeout: 10_000 },
    );
  });

  test('editor panels for Branches and Commits are present', async ({ page }) => {
    await expect(page.getByText('Branches').first()).toBeVisible();
    await expect(page.getByText('Commits').first()).toBeVisible();
  });

  test('all export buttons are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Copy Link/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SVG' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PNG' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download/i })).toBeVisible();
  });

  test('diagram state is encoded in the URL', async ({ page }) => {
    await page.waitForURL(/[?&]s=/, { timeout: 5_000 });
    expect(page.url()).toMatch(/[?&]s=/);
  });

  test('adding a branch increases the branch count', async ({ page }) => {
    const colorInputs = page.locator('input[type="color"]');
    // Wait for hydration — default state renders color pickers for each branch
    await colorInputs.first().waitFor();
    const before = await colorInputs.count();
    // First "+ Add" button belongs to the Branch editor
    await page.getByRole('button', { name: '+ Add' }).first().click();
    await expect(colorInputs).toHaveCount(before + 1);
  });

  test('adding a commit increases the commit count', async ({ page }) => {
    const idInputs = page.locator('input[placeholder="id"]');
    // Wait for hydration — default state renders id inputs for each commit
    await idInputs.first().waitFor();
    const before = await idInputs.count();
    // Second "+ Add" button belongs to the Commit editor
    await page.getByRole('button', { name: '+ Add' }).nth(1).click();
    await expect(idInputs).toHaveCount(before + 1);
  });

  test('shared URL encodes valid branch and commit data', async ({ page }) => {
    await page.waitForURL(/[?&]s=/, { timeout: 5_000 });
    const s = new URL(page.url()).searchParams.get('s');
    expect(s).toBeTruthy();
    // Decode and verify the payload contains branches and commits
    const state = JSON.parse(decodeURIComponent(atob(s!)));
    expect(Array.isArray(state.branches)).toBe(true);
    expect(state.branches.length).toBeGreaterThan(0);
    expect(Array.isArray(state.commits)).toBe(true);
    expect(state.commits.length).toBeGreaterThan(0);
  });
});

// ── DAG Visualizer ────────────────────────────────────────────────────────────

test.describe('DAG Visualizer (/tools/dag-visualizer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tools' }).click();
    await page.getByRole('link', { name: /DAG Visualizer/ }).click();
    // BrowserOnly renders React Flow on the client; wait for nodes to appear
    await page.getByTestId('flow-node').first().waitFor({ timeout: 15_000 });
  });

  test('renders the page title', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'DAG Visualizer', level: 1 }),
    ).toBeVisible();
  });

  test('renders the default 6 workflow nodes', async ({ page }) => {
    await expect(page.getByTestId('flow-node')).toHaveCount(6);
  });

  test('shows expected node labels from the default workflow', async ({ page }) => {
    await expect(page.getByText('Requirements', { exact: true })).toBeVisible();
    // exact: true to avoid matching the prompt text and skill badges that also contain "Deploy"
    await expect(page.getByText('Deploy', { exact: true })).toBeVisible();
  });

  test('toolbar buttons are all visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add node/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Format/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy link/i })).toBeVisible();
  });

  test('Add node button inserts a new node', async ({ page }) => {
    const before = await page.getByTestId('flow-node').count();
    await page.getByRole('button', { name: /Add node/i }).click();
    await expect(page.getByTestId('flow-node')).toHaveCount(before + 1, { timeout: 5_000 });
  });

  test('clicking a node opens the detail panel', async ({ page }) => {
    await page.getByTestId('flow-node').first().click();
    await expect(page.getByText('Edit Node')).toBeVisible();
  });

  test('detail panel shows prompt textarea and skill input', async ({ page }) => {
    await page.getByTestId('flow-node').first().click();
    await expect(page.getByText('Edit Node')).toBeVisible();
    await expect(
      page.getByPlaceholder(/Describe what the AI agent should do/i),
    ).toBeVisible();
    await expect(page.getByPlaceholder('/skill-name')).toBeVisible();
  });

  test('adding a skill to a node renders it in the panel', async ({ page }) => {
    await page.getByTestId('flow-node').first().click();
    await expect(page.getByText('Edit Node')).toBeVisible();
    await page.getByPlaceholder('/skill-name').fill('/my-custom-skill');
    // Press Enter to commit — same handler as the Add button, no button ambiguity
    await page.getByPlaceholder('/skill-name').press('Enter');
    await expect(page.getByText('/my-custom-skill').first()).toBeVisible();
  });

  test('closing the detail panel via the ✕ button hides it', async ({ page }) => {
    await page.getByTestId('flow-node').first().click();
    await expect(page.getByText('Edit Node')).toBeVisible();
    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(page.getByText('Edit Node')).not.toBeVisible();
  });

  test('Format button re-arranges nodes without crashing', async ({ page }) => {
    await page.getByRole('button', { name: /Format/i }).click();
    // All nodes should still be present after the dagre layout runs
    await expect(page.getByTestId('flow-node').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('flow-node')).toHaveCount(6);
  });

  test('graph state is serialised into the URL', async ({ page }) => {
    await page.waitForURL(/[?&]s=/, { timeout: 5_000 });
    expect(page.url()).toMatch(/[?&]s=/);
  });

  test('shared URL encodes valid nodes and edges', async ({ page }) => {
    await page.waitForURL(/[?&]s=/, { timeout: 5_000 });
    const s = new URL(page.url()).searchParams.get('s');
    expect(s).toBeTruthy();
    // Decode and verify the payload contains nodes and edges
    const state = JSON.parse(decodeURIComponent(atob(s!)));
    expect(Array.isArray(state.nodes)).toBe(true);
    expect(state.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(state.edges)).toBe(true);
    expect(state.edges.length).toBeGreaterThan(0);
    // Default node names should be present
    const names = state.nodes.map((n: { data: { name: string } }) => n.data.name);
    expect(names).toContain('Requirements');
    expect(names).toContain('Deploy');
  });
});

// ── PRD Creator ───────────────────────────────────────────────────────────────

test.describe('Tools index lists PRD Creator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tools' }).click();
  });

  test('lists the PRD Creator card', async ({ page }) => {
    await expect(page.getByRole('link', { name: /PRD Creator/ })).toBeVisible();
  });

  test('PRD Creator card navigates to the tool', async ({ page }) => {
    await page.getByRole('link', { name: /PRD Creator/ }).click();
    await expect(page.getByTestId('prd-app')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('PRD Creator (/tools/prd-creator)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/prd-creator');
    // Clear any stored PRDs so each test starts fresh
    await page.evaluate(() => localStorage.removeItem('prd-studio-v1'));
    await page.reload();
    await page.getByTestId('prd-app').waitFor({ timeout: 10_000 });
  });

  test('renders page title in document head', async ({ page }) => {
    await expect(page).toHaveTitle(/PRD Creator/);
  });

  test('shows empty state when no PRD is open', async ({ page }) => {
    await expect(page.getByTestId('prd-empty-state')).toBeVisible();
  });

  test('New PRD button creates a document with all 7 sections', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await expect(page.getByTestId('prd-section')).toHaveCount(7, { timeout: 5_000 });
  });

  test('section headers are visible after creating a PRD', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await page.getByTestId('prd-section').first().waitFor();
    await expect(page.getByText('Overview', { exact: true })).toBeVisible();
    await expect(page.getByText('Competitor Analysis', { exact: true })).toBeVisible();
    await expect(page.getByText('User Stories', { exact: true })).toBeVisible();
    await expect(page.getByText('Options', { exact: true })).toBeVisible();
    await expect(page.getByText('Implementation Plan', { exact: true })).toBeVisible();
    await expect(page.getByText('Completion Criteria', { exact: true })).toBeVisible();
    await expect(page.getByText('Follow-up Tasks & Notes', { exact: true })).toBeVisible();
  });

  test('title input accepts text and appears in sidebar', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await page.locator('#prd-title-input').fill('My Test PRD');
    await expect(page.getByTestId('prd-sidebar-item').filter({ hasText: 'My Test PRD' })).toBeVisible({ timeout: 3_000 });
  });

  test('clicking a section header collapses and expands it', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const overviewSection = page.getByTestId('prd-section').filter({ has: page.getByText('Overview', { exact: true }) });
    const textarea = overviewSection.locator('textarea');
    await expect(textarea).toBeVisible();
    // Collapse
    await overviewSection.locator('[class*="sectionHead"]').click();
    await expect(textarea).not.toBeVisible();
    // Expand
    await overviewSection.locator('[class*="sectionHead"]').click();
    await expect(textarea).toBeVisible();
  });

  test('can add a competitor row', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const compSection = page.getByTestId('prd-section').filter({ has: page.getByText('Competitor Analysis', { exact: true }) });
    const initialRows = await compSection.locator('tbody tr').count();
    await compSection.getByRole('button', { name: /Add competitor/i }).click();
    await expect(compSection.locator('tbody tr')).toHaveCount(initialRows + 1);
  });

  test('can add a user story', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const storiesSection = page.getByTestId('prd-section').filter({ has: page.getByText('User Stories', { exact: true }) });
    const initialCards = await storiesSection.locator('[class*="storyCard"]').count();
    await storiesSection.getByRole('button', { name: /Add user story/i }).click();
    await expect(storiesSection.locator('[class*="storyCard"]')).toHaveCount(initialCards + 1);
  });

  test('can add an option with pro and con', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const optSection = page.getByTestId('prd-section').filter({ has: page.getByText('Options', { exact: true }) });
    await optSection.getByRole('button', { name: /Add option/i }).click();
    const optCards = optSection.locator('[class*="optCard"]');
    await expect(optCards).toHaveCount(2);
    // Add a pro to the second option
    await optCards.nth(1).getByRole('button', { name: /Add pro/i }).click();
    await expect(optCards.nth(1).locator('[placeholder="Advantage…"]')).toHaveCount(2);
    // Add a con to the second option
    await optCards.nth(1).getByRole('button', { name: /Add con/i }).click();
    await expect(optCards.nth(1).locator('[placeholder="Drawback or risk…"]')).toHaveCount(2);
  });

  test('can add an implementation phase', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const planSection = page.getByTestId('prd-section').filter({ has: page.getByText('Implementation Plan', { exact: true }) });
    const initial = await planSection.locator('[class*="phaseCard"]').count();
    await planSection.getByRole('button', { name: /Add phase/i }).click();
    await expect(planSection.locator('[class*="phaseCard"]')).toHaveCount(initial + 1);
  });

  test('can check a completion criterion', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const criteriaSection = page.getByTestId('prd-section').filter({ has: page.getByText('Completion Criteria', { exact: true }) });
    const checkbox = criteriaSection.locator('input[type="checkbox"]').first();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test('Copy Markdown button is visible', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await expect(page.getByRole('button', { name: /Copy Markdown/i })).toBeVisible();
  });

  test('Export dropdown button is visible and opens menu', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    const exportBtn = page.getByRole('button', { name: /Export/i });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await expect(page.getByText('Export as PNG')).toBeVisible();
    await expect(page.getByText('Export as JPEG')).toBeVisible();
  });

  test('PRD persists in sidebar after page reload', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await page.locator('#prd-title-input').fill('Persistent PRD');
    // Wait for autosave debounce
    await page.waitForTimeout(1200);
    await page.reload();
    await page.getByTestId('prd-app').waitFor({ timeout: 10_000 });
    await expect(page.getByTestId('prd-sidebar-item').filter({ hasText: 'Persistent PRD' })).toBeVisible();
  });

  test('multiple PRDs appear in sidebar and can be switched', async ({ page }) => {
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await page.locator('#prd-title-input').fill('PRD Alpha');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /New PRD/ }).first().click();
    await page.locator('#prd-title-input').fill('PRD Beta');
    await expect(page.getByTestId('prd-sidebar-item')).toHaveCount(2);
    // Switch to Alpha
    await page.getByTestId('prd-sidebar-item').filter({ hasText: 'PRD Alpha' }).click();
    await expect(page.locator('#prd-title-input')).toHaveValue('PRD Alpha');
  });
});
