// A-BACK-044: at >= 1200 px the right panel collapses to a 40 px icon strip
// (top bar button or "\"), sections and the recorder fold, and Present
// hides everything but the stage and a small transport. Below 1200 px the
// panel stays a drawer (right-panel.spec.js, phone.spec.js).

import { test, expect, waitForAssets } from './fixtures.js';

test.use({ viewport: { width: 1440, height: 900 } });

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

const toggle = (page) => page.locator('#appTopbar [data-action="toggle-panel"]');

// Rink width on screen in the 2D view, px.
async function rink2dWidth(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { HALF_W, RINK_L } = await import('/src/constants.js');
    const td = await import('/src/authoring/topdown-camera.js');
    if (!td.isTopDown()) td.enterTopDown();
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const xs = [[-HALF_W, 0], [HALF_W, RINK_L], [-HALF_W, RINK_L], [HALF_W, 0]].map(([x, z]) => (new THREE.Vector3(x, 0, z).project(cam).x + 1) / 2 * innerWidth);
    return Math.max(...xs) - Math.min(...xs);
  });
}

test('the top bar button collapses the panel to an icon strip and the rink gets the room', async ({ page }) => {
  await boot(page);
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const before = await rink2dWidth(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#rightPanel')).toBeHidden();
  const strip = await page.locator('#panelStrip').boundingBox();
  expect(Math.round(strip.width)).toBe(40);
  expect(Math.round(strip.x + strip.width)).toBe(1440);
  expect(await rink2dWidth(page)).toBeGreaterThan(before + 20);
});

test('the untouched 3D view re-fits when the panel collapses', async ({ page }) => {
  await boot(page);
  const right = () => page.evaluate(async () => {
    const THREE = await import('three');
    const { camera } = await import('/src/scene.js');
    const { RINK_L, HALF_W } = await import('/src/constants.js');
    camera.updateMatrixWorld();
    const xs = [];
    for (const x of [-HALF_W, HALF_W]) for (const z of [0, RINK_L]) xs.push((new THREE.Vector3(x, 0, z).project(camera).x + 1) / 2 * innerWidth);
    return Math.max(...xs);
  });
  const before = await right();
  expect(before).toBeLessThanOrEqual(1440 - 320 + 1);
  await toggle(page).click();
  await expect.poll(right).toBeGreaterThan(before + 20);
  expect(await right()).toBeLessThanOrEqual(1440 - 40 + 1);
});

test('a strip icon opens the panel at that section; the state survives a reload; "\\" toggles', async ({ page }) => {
  await boot(page);
  await toggle(page).click();
  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect(page.locator('#panelStrip')).toBeVisible();
  await expect(page.locator('#rightPanel')).toBeHidden();
  await page.locator('#panelStrip [data-open="viewPanel"]').click();
  await expect(page.locator('#rightPanel')).toBeVisible();
  await expect(page.locator('#viewPanel')).toBeInViewport();
  await page.keyboard.press('Backslash');
  await expect(page.locator('#rightPanel')).toBeHidden();
  await page.keyboard.press('Backslash');
  await expect(page.locator('#rightPanel')).toBeVisible();
});

// Step 3: every section folds with the same control; so does the recorder.
const fold = (page, id) => page.locator(`#${id} .rp-fold`);

test('each panel section folds with one control; the fold survives a reload', async ({ page }) => {
  await boot(page);
  for (const id of ['inspector', 'layersPanel', 'viewPanel', 'coords']) await expect(fold(page, id)).toHaveCount(1);
  await expect(page.locator('#rightPanel .lp-toggle, #rightPanel .hud-toggle')).toHaveCount(0);
  // Coordinates starts folded, the rest open
  await expect(fold(page, 'coords')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#coordX')).toBeHidden();
  await expect(fold(page, 'viewPanel')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#rinkCheckbox')).toBeVisible();

  await fold(page, 'viewPanel').click();
  await expect(fold(page, 'viewPanel')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#rinkCheckbox')).toBeHidden();
  await fold(page, 'coords').click();
  await expect(page.locator('#coordX')).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect(page.locator('#rinkCheckbox')).toBeHidden();
  await expect(page.locator('#coordX')).toBeVisible();
  // a strip icon unfolds its section
  await toggle(page).click();
  await page.locator('#panelStrip [data-open="viewPanel"]').click();
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
});

// At 1440 x 900 the 2D fit is width-bound, so the rink does not grow; the
// stage gets taller and the rink re-centres in it.
test('the recorder folds to its transport bar and the 2D stage gets the room', async ({ page }) => {
  await boot(page);
  const stage = () => page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { RINK_L } = await import('/src/constants.js');
    const { readShellInsets } = await import('/src/ui/stage-frustum.js');
    const td = await import('/src/authoring/topdown-camera.js');
    if (!td.isTopDown()) td.enterTopDown();
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const centreY = (1 - new THREE.Vector3(0, 0, RINK_L / 2).project(cam).y) / 2 * innerHeight;
    return { bottom: readShellInsets().bottom, centreY };
  });
  const btn = page.locator('#timeline [data-action="fold-timeline"]');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const before = await stage();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#timeline .tl-strip')).toBeHidden();
  await expect(page.locator('#timeline [data-tl="play"]')).toBeVisible();
  await expect.poll(async () => (await stage()).bottom).toBeLessThan(before.bottom - 40);
  expect((await stage()).centreY).toBeGreaterThan(before.centreY + 20);
  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect(page.locator('#timeline .tl-strip')).toBeHidden();
  await page.locator('#timeline [data-action="fold-timeline"]').click();
  await expect(page.locator('#timeline .tl-strip')).toBeVisible();
});

// Step 4: Present hides everything but the stage and a small transport,
// plays from frame 1, and Esc restores the exact layout and camera.
test('Present shows only the stage and a small transport; Esc restores layout and camera', async ({ page }) => {
  await boot(page);
  // a two-frame play, the panel as a strip and the recorder folded beforehand
  await page.evaluate(async () => {
    const { duplicateFrame, setFrameDuration } = await import('/src/authoring/frames.js');
    duplicateFrame(0, 1);
    // A long play: a 1 s one can end on a slow CI runner before the pause
    // click, and that click then plays it again from the start.
    setFrameDuration(0, 60000);
  });
  await toggle(page).click();
  await page.locator('#timeline [data-action="fold-timeline"]').click();
  const camBefore = await page.evaluate(async () => (await import('/src/scene.js')).getCameraRig());

  const present = page.locator('#appTopbar [data-action="present"]');
  await present.click();
  const during = await page.evaluate(async () => {
    const { PRESENT_HIDES } = await import('/src/ui/panel-layout.js');
    const { readShellInsets } = await import('/src/ui/stage-frustum.js');
    const { state } = await import('/src/state.js');
    const hidden = PRESENT_HIDES.filter((id) => document.getElementById(id))
      .filter((id) => getComputedStyle(document.getElementById(id)).display !== 'none');
    return { presenting: document.documentElement.classList.contains('presenting'), stillShown: hidden, insets: readShellInsets(), playing: state.playback.playing, stripShown: getComputedStyle(document.getElementById('panelStrip')).display !== 'none' };
  });
  expect(during).toEqual({ presenting: true, stillShown: [], insets: { left: 0, top: 0, right: 0, bottom: 0 }, playing: true, stripShown: false });
  await expect(page.locator('#presentBar')).toBeVisible();
  await expect(page.locator('#presentBar [data-present="play"]')).toBeFocused();

  // pause from the small transport
  // 5 s of a slow runner still leaves the play running
  await page.evaluate(async () => (await import('/src/authoring/playback.js')).tickPlayback(5000));
  await page.locator('#presentBar [data-present="play"]').click();
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.playback.playing)).toBe(false);

  await page.keyboard.press('Escape');
  await expect(page.locator('#presentBar')).toBeHidden();
  await expect(page.locator('#panelStrip')).toBeVisible();          // strip, as before
  await expect(page.locator('#timeline .tl-strip')).toBeHidden();   // still folded
  await expect(present).toBeFocused();
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCameraRig } = await import('/src/scene.js');
    return { presenting: document.documentElement.classList.contains('presenting'), playing: state.playback.playing, previewing: state.playback.previewing, rig: getCameraRig() };
  });
  expect(after.presenting).toBe(false);
  expect(after.playing).toBe(false);
  expect(after.previewing).toBe(false);
  for (const k of ['tx', 'tz', 'dist', 'pitch']) expect(Math.abs(after.rig[k] - camBefore[k])).toBeLessThan(1);
});

test('Exit leaves Present too, and Present clears the selection', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const chips = await import('/src/authoring/chips.js');
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    chips.spawnChip({ team: 1, x: 0, z: 15000, number: 7, pushHistory: false });
    selectObject(state.chipGroups.at(-1));
  });
  await page.locator('#appTopbar [data-action="present"]').click();
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.selected)).toBe(null);
  await page.locator('#presentBar [data-present="exit"]').click();
  await expect(page.locator('#rightPanel')).toBeVisible();
  await expect(page.locator('#appTopbar')).toBeVisible();
});
