// A-BACK-054: Train mode in the left rail (A-Q-008 revised) with its own
// practice rink (A-Q-011). Plan's editing UI hides, the Train panel shows,
// and nothing done in Train reaches the user's play, its saved copy or its
// undo history. "Open as play" copies the situation into a new project.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A && !!state.goalies.B;
  });
}

const railBtn = (page, mode) => page.locator(`#appRail [data-mode="${mode}"]`);
const panel = (page) => page.locator('#trainPanel');

// The Plan play: a named project with a moved goalie, saved.
async function seedPlan(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { saveDoc, getCurrentProjectId } = await import('/src/authoring/storage.js');
    const { pushHistory } = await import('/src/authoring/history.js');
    state.goalies.A.position.set(-600, 0, 4200);
    const doc = ensureDoc();
    doc.scheme.goalies = { ...(doc.scheme.goalies || {}), A: { x: -600, z: 4200, angle: 0 } };
    doc.meta.name = 'My play';
    saveDoc();
    pushHistory();
    const id = getCurrentProjectId();
    return { id, doc: JSON.stringify(doc), saved: localStorage.getItem(`floorball-3d:project:${id}`), history: localStorage.getItem(`floorball-3d:history:${id}`) };
  });
}

test('the Train button switches to Train mode: Plan UI hidden, Train panel shown', async ({ page }) => {
  await boot(page);
  await expect(railBtn(page, 'train')).toBeVisible();
  await expect(panel(page)).toBeHidden();
  await railBtn(page, 'train').click();
  await expect(railBtn(page, 'train')).toHaveClass(/active/);
  await expect(railBtn(page, 'plan')).not.toHaveClass(/active/);
  await expect(panel(page)).toBeVisible();
  for (const id of ['toolPalette', 'timeline', 'dock', 'rightPanel']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#appTopbarProjectName')).toBeHidden();
  await expect(panel(page).getByRole('heading', { name: 'Goalie training' })).toBeVisible();
  await expect(panel(page).getByRole('link', { name: 'Open the module' })).toHaveAttribute('href', /goalies-positionierung/);

  await railBtn(page, 'plan').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#toolPalette')).toBeVisible();
  await expect(page.locator('#appTopbarProjectName')).toBeVisible();
});

test('Train shows the practice rink; moving the goalie there never reaches the Plan play', async ({ page }) => {
  await boot(page);
  const seeded = await seedPlan(page);
  // The actor tick may autosave the seeded play once more; snapshot after it settles.
  await page.waitForTimeout(300);
  const before = await page.evaluate((id) => ({
    id,
    saved: localStorage.getItem(`floorball-3d:project:${id}`),
    history: localStorage.getItem(`floorball-3d:history:${id}`),
  }), seeded.id);
  await railBtn(page, 'train').click();

  const inTrain = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { saveDoc } = await import('/src/authoring/storage.js');
    const { pushHistory } = await import('/src/authoring/history.js');
    const doc = ensureDoc();
    const out = { name: doc.meta.name, players: Object.keys(doc.scheme.players).length, ball: { x: state.ballGroup.position.x, z: state.ballGroup.position.z } };
    state.goalies.A.position.set(2500, 0, 5000);   // the trainee moves the goalie
    doc.scheme.goalies = { A: { x: 2500, z: 5000, angle: 1 } };
    saveDoc();
    pushHistory();
    return out;
  });
  expect(inTrain.name).toBe('Goalie training');
  expect(inTrain.players).toBe(0);
  expect(inTrain.ball).toEqual({ x: 1500, z: 9500 });

  const stored = await page.evaluate((id) => ({
    saved: localStorage.getItem(`floorball-3d:project:${id}`),
    history: localStorage.getItem(`floorball-3d:history:${id}`),
    current: localStorage.getItem('floorball-3d:currentProjectId'),
  }), before.id);
  expect(stored.saved).toBe(before.saved);
  expect(stored.history).toBe(before.history);
  expect(stored.current).toBe(before.id);

  await railBtn(page, 'plan').click();
  const back = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const doc = ensureDoc();
    return { name: doc.meta.name, goalie: doc.scheme.goalies.A, mesh: { x: state.goalies.A.position.x, z: state.goalies.A.position.z } };
  });
  expect(back.name).toBe('My play');
  expect(back.goalie).toMatchObject({ x: -600, z: 4200 });
  expect(back.mesh).toEqual({ x: -600, z: 4200 });
  await expect(page.locator('#dockProjectName')).toHaveText('My play');
});

test('a reload while in Train lands in Plan with the Plan play', async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await railBtn(page, 'train').click();
  await expect(panel(page)).toBeVisible();
  await boot(page);
  await expect(railBtn(page, 'plan')).toHaveClass(/active/);
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#dockProjectName')).toHaveText('My play');
});

test('Open as play copies the practice situation into a new project and switches to Plan', async ({ page }) => {
  await boot(page);
  const before = await seedPlan(page);
  await railBtn(page, 'train').click();
  await panel(page).getByRole('button', { name: 'Open as play' }).click();
  await expect(railBtn(page, 'plan')).toHaveClass(/active/);
  await expect(page.locator('#dockProjectName')).toHaveText('Goalie training');
  const r = await page.evaluate(async (oldId) => {
    const { getCurrentProjectId, loadProject } = await import('/src/authoring/storage.js');
    const id = getCurrentProjectId();
    return { id, ball: loadProject(id)?.frames[0].scheme.balls.main, old: loadProject(oldId)?.meta.name };
  }, before.id);
  expect(r.id).not.toBe(before.id);
  expect(r.ball).toMatchObject({ x: 1500, z: 9500 });
  expect(r.old).toBe('My play');
});

test('the Train panel follows the app language', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await page.locator('#langBtn').click();
  await page.locator('#langMenu').getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Goalie-Training' })).toBeVisible();
  await expect(panel(page).getByRole('link', { name: 'Zum Lernmodul' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Als Spielzug öffnen' })).toBeVisible();
});

test('the side-panel toggle hides in Train; on a phone the panel leaves the rink visible', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await expect(page.locator('#appTopbar [data-action="toggle-panel"]')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const p = await panel(page).boundingBox();
  const vp = page.viewportSize();
  expect(p.width).toBeGreaterThanOrEqual(vp.width - 1);      // a bottom sheet across the screen
  expect(p.y).toBeGreaterThan(vp.height * 0.45);             // the top half shows the rink
  const tabs = await page.locator('#appRail').boundingBox();
  expect(p.y + p.height).toBeLessThanOrEqual(tabs.y + 1);    // above the tab bar
});
