// A-BACK-040 step 4: camera presets in the top bar ("Views" menu) and on
// Shift+1..6. The camera blends there over ~400 ms in the animate() loop;
// rAF can stall in a background tab, so the spec finishes the blend with
// tickCameraTween() itself.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const chips = await import('/src/authoring/chips.js');
    const td = await import('/src/authoring/topdown-camera.js');
    ensureDoc().scheme.players = {};
    chips.rebuildFromDoc();
    chips.spawnChip({ team: 1, x: 3000, z: 15000, number: 7, angle: Math.PI / 2, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
    document.getElementById('resetViewBtn').click();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 1);
}

async function settle(page) {
  return page.evaluate(async () => {
    const { tickCameraTween } = await import('/src/ui/camera-menu.js');
    tickCameraTween(5000);
    const { camera } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    return {
      x: camera.position.x, y: camera.position.y, z: camera.position.z,
      is3d: state.activeCamera === camera,
    };
  });
}

const menuButton = (page) => page.locator('#appTopbar [data-action="camera-presets"]');
const item = (page, id) => page.locator(`#cameraPresetMenu [data-preset="${id}"]`);

test('the Views menu lists six presets; Behind goal A puts the camera behind the end board', async ({ page }) => {
  await boot(page);
  await menuButton(page).click();
  await expect(page.locator('#cameraPresetMenu [data-preset]')).toHaveCount(6);
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  await item(page, 'goal-a').click();
  await expect(page.locator('#cameraPresetMenu')).toBeHidden();
  const cam = await settle(page);
  expect(cam.z).toBeLessThan(0);
  expect(Math.abs(cam.x)).toBeLessThan(1);
  expect(cam.y).toBeGreaterThan(2000);
});

test('Shift+3 jumps behind goal B', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Shift+Digit3');
  const cam = await settle(page);
  expect(cam.z).toBeGreaterThan(40000);
});

test('Player eye needs a selected chip, then stands at its head looking where it faces', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => (await import('/src/selection.js')).deselectAll());
  await menuButton(page).click();
  await expect(item(page, 'player')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cameraPresetMenu')).toBeHidden();
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.chipGroups[0]);
  });
  await menuButton(page).click();
  await item(page, 'player').click();
  const cam = await settle(page);
  expect(Math.hypot(cam.x - 3000, cam.z - 15000)).toBeLessThan(300);
  expect(cam.y).toBeGreaterThan(1400);
  const yaw = await page.evaluate(async () => (await import('/src/scene.js')).camera.rotation.y - Math.PI);
  expect(Math.abs(Math.atan2(Math.sin(yaw - Math.PI / 2), Math.cos(yaw - Math.PI / 2)))).toBeLessThan(1e-3);
});

test('a preset chosen in 2D switches to 3D; Stand brings back the fitted default view', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).enterTopDown());
  await menuButton(page).click();
  await item(page, 'corner').click();
  const corner = await settle(page);
  expect(corner.is3d).toBe(true);
  await menuButton(page).click();
  await item(page, 'stand').click();
  await settle(page);
  expect(await page.evaluate(async () => (await import('/src/scene.js')).isDefaultView())).toBe(true);
});

// "From the ball" once silently did nothing until a goal had been clicked
// (it needed state.targetGoal). Without a target it looks at the nearer goal.
test('From the ball works with no goal targeted: camera at the ball, looking at the nearer goal', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.targetGoal = null;
    state.ballGroup.position.set(-1700, 0, 5300);   // goal A end
    return (await import('/src/scene.js')).camera.position.toArray();
  });
  await menuButton(page).click();
  await page.locator('#cameraPresetMenu [data-action="view-from-ball"]').click();
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const { camera } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const dir = camera.getWorldDirection(new THREE.Vector3());
    return { cam: camera.position.toArray(), ball: state.ballGroup.position.toArray(), dirZ: dir.z, is3d: state.activeCamera === camera };
  });
  expect(r.is3d).toBe(true);
  expect(r.cam).not.toEqual(before);
  expect(Math.hypot(r.cam[0] - r.ball[0], r.cam[2] - r.ball[2])).toBeLessThan(500);
  expect(r.dirZ).toBeLessThan(0);   // goal A sits at small z: the camera looks toward -z
});
