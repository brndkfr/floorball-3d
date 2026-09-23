// Browser-level integration tests for A-GAP-003 (named projects).
// Every test resets localStorage before the app boots so specs don't
// leak state into each other. See CLAUDE.md for why the reloads bounce
// through about:blank + CDP setCacheDisabled.

import { test, expect } from '@playwright/test';

// Boots the app in an empty context. Playwright's `page` fixture already
// gives every test a fresh browser context with empty localStorage.
async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForBootstrap(page);
  await dismissOnboarding(page);
}

// Seeds localStorage with legacy keys before the app boots. Establishes the
// origin on a static asset rather than '/' - booting the app first let its
// rAF loop saveDoc() a fresh "Untitled" project back into storage between
// the clear and the reload. NOT addInitScript - that would re-seed on every
// reload during the test.
async function bootAppWithSeed(page, seed) {
  await page.goto('/assets/rink.mtl');
  await page.evaluate((s) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, seed);
  await page.goto('/', { waitUntil: 'load' });
  await waitForBootstrap(page);
  await dismissOnboarding(page);
}

async function waitForBootstrap(page) {
  // notifyProjectChanged() at the end of authoring/index.js's bootstrap
  // fills the label - so a non-empty text confirms module init has
  // caught up with the final state.doc.
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
}

async function dismissOnboarding(page) {
  const tip = page.locator('#onboardingTip button', { hasText: 'Got it' });
  if (await tip.count()) await tip.first().click();
}

async function readState(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      name: state.doc.meta.name,
      players: Object.keys(state.doc.frames[0].scheme.players).length,
    };
  });
}

async function openLibrary(page) {
  await page.locator('[data-dock="overflow"]').click();
  await page.locator('[data-action="library"]').click();
  await page.waitForSelector('dialog.library-dialog');
}

async function libraryRowNames(page) {
  return page.$$eval('.library-row', (rows) =>
    rows.map((r) => ({
      name: r.querySelector('.library-name').textContent,
      current: r.classList.contains('current'),
    })),
  );
}

async function clickRowAction(page, name, actionLabel) {
  const row = page.locator('.library-row', { hasText: name }).first();
  await row.locator('button', { hasText: actionLabel }).click();
}

test.describe('A-GAP-003 named projects', () => {
  test('fresh load shows Untitled and rename via project button persists across reload', async ({ page }) => {
    await bootApp(page);
    await expect(page.locator('#dockProjectName')).toHaveText('Untitled');

    await page.locator('[data-dock="project"]').click();
    const dialog = page.locator('dialog.app-dialog');
    await dialog.waitFor();
    await dialog.locator('.app-dialog-input').fill('My first play');
    await dialog.locator('button[value="ok"]').click();
    await expect(page.locator('#dockProjectName')).toHaveText('My first play');

    await page.reload({ waitUntil: 'load' });
    await waitForBootstrap(page);
    await dismissOnboarding(page);
    await expect(page.locator('#dockProjectName')).toHaveText('My first play');
  });

  test('New project from Library switches active project, keeps the previous one isolated', async ({ page }) => {
    await bootApp(page);

    await page.evaluate(async () => {
      const chips = await import('/src/authoring/chips.js');
      chips.spawnChip({ team: 'T1', x: 1000, z: 1000 });
    });
    expect((await readState(page)).players).toBe(1);

    await openLibrary(page);
    await page.locator('.library-new').click();
    const nameDialog = page.locator('dialog.app-dialog');
    await nameDialog.waitFor();
    await nameDialog.locator('.app-dialog-input').fill('Second scheme');
    await nameDialog.locator('button[value="ok"]').click();

    await expect(page.locator('#dockProjectName')).toHaveText('Second scheme');
    const afterNew = await readState(page);
    expect(afterNew.name).toBe('Second scheme');
    expect(afterNew.players).toBe(0);

    await clickRowAction(page, 'Untitled', 'Load');
    await expect(page.locator('#dockProjectName')).toHaveText('Untitled');
    expect((await readState(page)).players).toBe(1);
  });

  test('legacy singleton + slot keys migrate into projects on first boot', async ({ page }) => {
    const legacyDoc = {
      version: 2,
      hideMarkup: false,
      currentFrame: 0,
      frames: [{ id: 'f_legacy', duration: 1000, scheme: { players: {}, balls: {}, shapes: [], cones: [] } }],
    };
    const legacyDocJson = JSON.stringify(legacyDoc);
    await bootAppWithSeed(page, {
      'floorball-3d:doc': legacyDocJson,
      'floorball-3d:slot:Zone entry': legacyDocJson,
      'floorball-3d:slot:Cycle drill': legacyDocJson,
    });

    await expect(page.locator('#dockProjectName')).toHaveText('My scheme');

    const storage = await page.evaluate(() => ({
      legacyDocGone: !localStorage.getItem('floorball-3d:doc'),
      legacySlotGone: !localStorage.getItem('floorball-3d:slot:Zone entry'),
      flag: localStorage.getItem('floorball-3d:migrated:v1'),
    }));
    expect(storage.legacyDocGone).toBe(true);
    expect(storage.legacySlotGone).toBe(true);
    expect(storage.flag).toBe('1');

    await openLibrary(page);
    const rows = await libraryRowNames(page);
    expect(rows.map((r) => r.name).sort()).toEqual(['Cycle drill', 'My scheme', 'Zone entry']);
    expect(rows.find((r) => r.current).name).toBe('My scheme');
  });

  test('deleting the current project falls back to another', async ({ page }) => {
    await bootApp(page);
    await openLibrary(page);
    await page.locator('.library-new').click();
    const nameDialog = page.locator('dialog.app-dialog');
    await nameDialog.waitFor();
    await nameDialog.locator('.app-dialog-input').fill('Fallback');
    await nameDialog.locator('button[value="ok"]').click();
    await expect(page.locator('#dockProjectName')).toHaveText('Fallback');

    await clickRowAction(page, 'Fallback', 'Delete');
    const confirm = page.locator('dialog.app-dialog');
    await confirm.waitFor();
    await confirm.locator('button[value="ok"]').click();

    await expect(page.locator('#dockProjectName')).toHaveText('Untitled');
    const rows = await libraryRowNames(page);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Untitled');
    expect(rows[0].current).toBe(true);
  });
});
