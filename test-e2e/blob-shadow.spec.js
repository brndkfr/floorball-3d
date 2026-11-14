// S-BACK-030 step 3: blob shadows under figures, goalies and balls in the
// 3D view; none in the top-down view.

import { test, expect, waitUntil, waitForAssets } from './fixtures.js';

const figuresReady = async () => (await import('/src/authoring/figures.js')).figuresLoaded();

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
    chips.spawnChip({ team: 2, x: 3000, z: 24000, number: 12, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 2);
}

// rAF can stall in a background tab: drive the ticks directly.
async function shadows(page) {
  return page.evaluate(async () => {
    const { scene } = await import('/src/scene.js');
    const { tickFigures } = await import('/src/authoring/figures.js');
    const { tickBlobShadows } = await import('/src/blob-shadow.js');
    tickFigures();
    tickBlobShadows();
    return scene.getObjectByName('blobShadows').children.filter((m) => m.visible)
      .map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, r: m.scale.x, opacity: m.material.opacity }));
  });
}

test('goalies and the ball have a shadow in 3D; figures get one when they show', async ({ page }) => {
  await boot(page);
  const plain = await shadows(page);
  expect(plain.length).toBe(3);                       // two goalies + the ball, chips are flat discs
  for (const s of plain) expect(s.y).toBeLessThan(4); // under the selection ring

  await page.evaluate(async () => (await import('/src/authoring/figures.js')).setFiguresEnabled(true));
  await waitUntil(page, figuresReady);
  const withFigures = await shadows(page);
  expect(withFigures.length).toBe(5);
  expect(withFigures.some((s) => Math.abs(s.x) < 1 && Math.abs(s.z - 20000) < 1)).toBe(true);
  expect(withFigures.some((s) => Math.abs(s.x - 3000) < 1 && Math.abs(s.z - 24000) < 1)).toBe(true);
});

test('no shadows in the top-down view, and they are back after it', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).enterTopDown());
  expect((await shadows(page)).length).toBe(0);
  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).exitTopDown());
  expect((await shadows(page)).length).toBe(3);
});

test('a lifted ball throws a wider, fainter shadow, and hiding the ball hides it', async ({ page }) => {
  await boot(page);
  const ballShadow = async () => {
    const pos = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { x: state.ballGroup.position.x, z: state.ballGroup.position.z };
    });
    return (await shadows(page)).find((s) => Math.abs(s.x - pos.x) < 1 && Math.abs(s.z - pos.z) < 1 && s.r < 400);
  };
  const onFloor = await ballShadow();
  await page.evaluate(async () => { (await import('/src/state.js')).state.ballGroup.position.y = 900; });
  const lifted = await ballShadow();
  expect(lifted.r).toBeGreaterThan(onFloor.r);
  expect(lifted.opacity).toBeLessThan(onFloor.opacity);
  expect(lifted.y).toBe(onFloor.y);                   // the shadow stays on the floor

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.ballGroup.position.y = 0;
    state.ballGroup.visible = false;
  });
  expect((await shadows(page)).length).toBe(2);
});

test('a shadow never takes a click: the floor under it still deselects', async ({ page }) => {
  await boot(page);
  await shadows(page);
  const hits = await page.evaluate(async () => {
    const THREE = await import('three');
    const { scene } = await import('/src/scene.js');
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 5000, 20000), new THREE.Vector3(0, -1, 0));
    scene.updateMatrixWorld();
    return ray.intersectObjects(scene.getObjectByName('blobShadows').children, true).length;
  });
  expect(hits).toBe(0);
});
