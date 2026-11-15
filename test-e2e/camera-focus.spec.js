// A-BACK-040 step 5: in 3D, F frames the selection (nothing selected: the
// default view) and a double-click moves the point the camera turns around
// to the floor under the cursor. In 2D, F still resets the 2D view. The
// blend runs in animate(); rAF can stall in a background tab, so the spec
// finishes it with tickCameraTween().

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
    chips.spawnChip({ team: 1, x: -5000, z: 30000, number: 7, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
    document.getElementById('resetViewBtn').click();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 1);
}

async function settledRig(page) {
  return page.evaluate(async () => {
    (await import('/src/ui/camera-menu.js')).tickCameraTween(5000);
    const { getCameraRig, isDefaultView } = await import('/src/scene.js');
    return { ...getCameraRig(), isDefault: isDefaultView() };
  });
}

test('F frames the selected chip; with nothing selected it goes back to the default view', async ({ page }) => {
  await boot(page);
  const start = await settledRig(page);
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.chipGroups[0]);
  });
  await page.keyboard.press('f');
  const framed = await settledRig(page);
  expect(Math.hypot(framed.tx + 5000, framed.tz - 30000)).toBeLessThan(50);
  expect(framed.dist).toBeLessThan(start.dist / 3);
  expect(Math.abs(framed.yaw - start.yaw)).toBeLessThan(1e-3);   // same direction, just closer

  await page.evaluate(async () => (await import('/src/selection.js')).deselectAll());
  await page.keyboard.press('f');
  expect((await settledRig(page)).isDefault).toBe(true);
});

test('F in 2D still resets the 2D view', async ({ page }) => {
  await boot(page);
  const zoom = await page.evaluate(async () => {
    const td = await import('/src/authoring/topdown-camera.js');
    const { topDownCamera } = await import('/src/scene.js');
    td.enterTopDown();
    const fitted = topDownCamera.zoom;
    topDownCamera.zoom = fitted * 3;
    topDownCamera.position.x += 4000;
    return fitted;
  });
  await page.keyboard.press('f');
  const after = await page.evaluate(async () => (await import('/src/scene.js')).topDownCamera.zoom);
  expect(after).toBeCloseTo(zoom, 6);
});

test('a double-click on empty floor makes that point the one the camera turns around', async ({ page }) => {
  await boot(page);
  const before = await settledRig(page);
  const spot = { x: 4000, z: 12000 };
  const at = await page.evaluate(async ({ x, z }) => {
    const THREE = await import('three');
    const { camera } = await import('/src/scene.js');
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, 0, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }, spot);
  await page.mouse.dblclick(at.x, at.y);
  const after = await settledRig(page);
  expect(Math.hypot(after.tx - spot.x, after.tz - spot.z)).toBeLessThan(150);
  expect(Math.abs(after.dist - before.dist)).toBeLessThan(5);
});
