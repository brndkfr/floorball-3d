// S-BACK-030 step 8: the chip number keeps a readable on-screen size in the
// 3D view (chip-sprite-math.js SPRITE_PX), close to the camera and across
// the rink; the 2D view keeps the plain size. rAF can stall in a background
// tab, so the spec calls tickChipSprites() itself.

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
    chips.spawnChip({ team: 1, x: 0, z: 20000, number: 7, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 1);
}

// Place the 3D camera `distMm` from the chip, looking at it, tick the
// sprites and return the number sprite's on-screen height in px.
async function numberPx(page, distMm) {
  return page.evaluate(async (distMm) => {
    const THREE = await import('three');
    const { camera, lookAtFrom } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const { tickChipSprites } = await import('/src/authoring/chips.js');
    const g = state.chipGroups[0];
    camera.position.set(0, 1200, 20000 + distMm);
    lookAtFrom(camera.position, { x: 0, y: 300, z: 20000 });
    camera.updateMatrixWorld();
    tickChipSprites();
    g.updateMatrixWorld(true);
    const sprite = g.userData.sprites[0];
    const centre = sprite.getWorldPosition(new THREE.Vector3());
    const h = sprite.getWorldScale(new THREE.Vector3()).y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const a = centre.clone().addScaledVector(up, h / 2).project(camera);
    const b = centre.clone().addScaledVector(up, -h / 2).project(camera);
    return Math.abs(a.y - b.y) / 2 * window.innerHeight;
  }, distMm);
}

test('the chip number stays between 18 and 40 px in 3D', async ({ page }) => {
  await boot(page);
  const close = await numberPx(page, 1500);
  expect(close).toBeLessThanOrEqual(40.5);
  expect(close).toBeGreaterThan(30);
  const far = await numberPx(page, 45000);
  expect(far).toBeGreaterThanOrEqual(17.5);
  expect(far).toBeLessThan(25);
});

test('the 2D view keeps the plain sprite size', async ({ page }) => {
  await boot(page);
  await numberPx(page, 1500);   // leave a clamped scale behind
  const scale = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { tickChipSprites } = await import('/src/authoring/chips.js');
    const td = await import('/src/authoring/topdown-camera.js');
    td.enterTopDown();
    tickChipSprites();
    return state.chipGroups[0].userData.sprites[0].scale.y;
  });
  expect(scale).toBe(110);
});
