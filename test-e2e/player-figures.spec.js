// A-BACK-031: 3D player figures. Display-only Layers toggle that puts a
// Quaternius body on every chip in the perspective view; top-down keeps
// plain chips. The GLB loads lazily on first enable.

import { test, expect } from './fixtures.js';

// page.waitForFunction() does not await an async predicate: the returned
// Promise is truthy, so it resolves after one poll whatever the answer
// (checked 2026-10-07, Playwright 1.63). The shared waitForAssets() has
// that problem, so this spec polls page.evaluate(), which does await.
async function waitUntil(page, fn, arg, timeout = 20000) {
  await expect.poll(() => page.evaluate(fn, arg), { timeout }).toBe(true);
}
const assetsLoaded = async () => (await import('/src/status.js')).pendingLoads() === 0;
const figuresReady = async () => (await import('/src/authoring/figures.js')).figuresLoaded();

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitUntil(page, assetsLoaded);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

// Three chips (two teams) in the 3D view.
async function setup(page) {
  await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const chips = await import('/src/authoring/chips.js');
    const td = await import('/src/authoring/topdown-camera.js');
    ensureDoc().scheme.players = {};
    chips.rebuildFromDoc();
    chips.spawnChip({ team: 1, x: 0, z: 20000, number: 7, pushHistory: false });
    chips.spawnChip({ team: 2, x: 1500, z: 20000, number: 12, pushHistory: false });
    chips.spawnChip({ team: 1, x: -1500, z: 20000, number: 3, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 3);
}

// Figures attach in the per-frame tick; rAF can stall in a background
// tab, so drive one tick directly instead of waiting for it.
async function figureStats(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { tickFigures } = await import('/src/authoring/figures.js');
    tickFigures();
    return state.chipGroups.map((g) => {
      const fig = g.userData.figure;
      if (!fig) return null;
      const box = new THREE.Box3().setFromObject(fig);
      const sprite = (g.userData.sprites || [])[0];
      const spriteWorld = sprite ? sprite.getWorldPosition(new THREE.Vector3()) : null;
      return {
        team: fig.userData.team,
        heightMm: box.max.y - box.min.y,
        minY: box.min.y,
        centerX: (box.min.x + box.max.x) / 2,
        centerZ: (box.min.z + box.max.z) / 2,
        chipX: g.position.x,
        chipZ: g.position.z,
        widthMm: box.max.x - box.min.x,
        spriteY: spriteWorld?.y ?? null,
      };
    });
  });
}

// Asserts every chip has (or has no) figure; on failure the message
// carries the state that decides it, so a CI flake explains itself.
async function expectFigures(page, present) {
  const stats = await figureStats(page);
  const ok = stats.every((f) => (present ? !!f : f === null));
  let why = '';
  if (!ok) {
    why = JSON.stringify(await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const td = await import('/src/authoring/topdown-camera.js');
      const f = await import('/src/authoring/figures.js');
      return { topDown: td.isTopDown(), loaded: f.figuresLoaded(), enabled: state.figuresEnabled, chips: state.chipGroups.length, };
    }));
  }
  expect(ok, `figures ${present ? 'missing' : 'still shown'}: ${why}`).toBe(true);
  return stats;
}

async function enableFigures(page) {
  await page.locator('#figuresVisibleToggle').check();
  await waitUntil(page, figuresReady);
}

test('figures are off by default and the GLB is not fetched at boot', async ({ page }) => {
  const glbRequests = [];
  page.on('request', (r) => { if (r.url().includes('player_figure.glb')) glbRequests.push(r.url()); });
  await boot(page);
  await setup(page);
  await expect(page.locator('#figuresVisibleToggle')).not.toBeChecked();
  await expectFigures(page, false);
  expect(glbRequests).toEqual([]);
});

test('toggle on: one real-size figure per chip, numbers above the heads, doc untouched', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await boot(page);
  await setup(page);
  const docBefore = await page.evaluate(async () => JSON.stringify((await import('/src/authoring/doc.js')).ensureDoc()));

  await enableFigures(page);
  const stats = await expectFigures(page, true);
  for (const f of stats) {
    // 1.81 m body; the chip group's 5x display scale must not leak in.
    expect(f.heightMm).toBeGreaterThan(1700);
    expect(f.heightMm).toBeLessThan(1900);
    expect(Math.abs(f.minY)).toBeLessThan(50);              // feet on the floor
    expect(Math.abs(f.centerX - f.chipX)).toBeLessThan(150); // standing on its chip
    expect(Math.abs(f.centerZ - f.chipZ)).toBeLessThan(200);
    expect(f.widthMm).toBeLessThan(1100);                    // arms down, not the 1.86 m T-pose
    expect(f.spriteY).toBeGreaterThan(1900);                 // number above the head
  }
  expect(stats.map((f) => f.team).sort()).toEqual([1, 1, 2]);

  const docAfter = await page.evaluate(async () => JSON.stringify((await import('/src/authoring/doc.js')).ensureDoc()));
  expect(docAfter).toBe(docBefore);
  expect(pageErrors).toEqual([]);
});

test('top-down hides figures and drops the numbers back onto the chips', async ({ page }) => {
  await boot(page);
  await setup(page);
  await enableFigures(page);
  await expectFigures(page, true);

  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).enterTopDown());
  await expectFigures(page, false);
  const spriteY = await page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    return state.chipGroups[0].userData.sprites[0].getWorldPosition(new THREE.Vector3()).y;
  });
  expect(spriteY).toBeLessThan(500);

  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).exitTopDown());
  await expectFigures(page, true);
});

test('figure follows its chip, switches kit on team change, and leaves the chip disc colour to chips.js', async ({ page }) => {
  await boot(page);
  await setup(page);
  await enableFigures(page);
  await figureStats(page);

  const result = await page.evaluate(async () => {
    const chips = await import('/src/authoring/chips.js');
    const { state } = await import('/src/state.js');
    const { tickFigures } = await import('/src/authoring/figures.js');
    const g = state.chipGroups[0];
    g.position.set(4000, 0, 15000);
    chips.persistChipPosition(g);
    const id = g.userData.chip.id;
    const bodyColorBefore = [];
    g.userData.figure.traverse((n) => { if (n.isMesh) bodyColorBefore.push(n.material.color.getHex()); });
    chips.updateChipTeam(id, 2, false);
    tickFigures();
    const fig = g.userData.figure;
    const bodyColorAfter = [];
    fig.traverse((n) => { if (n.isMesh) bodyColorAfter.push(n.material.color.getHex()); });
    const wp = fig.getWorldPosition(new (await import('three')).Vector3());
    return { team: fig.userData.team, x: wp.x, z: wp.z, bodyColorBefore, bodyColorAfter };
  });
  expect(result.team).toBe(2);
  expect(result.x).toBeCloseTo(4000, 0);
  expect(result.z).toBeCloseTo(15000, 0);
  // updateChipTeam recolours the disc but must not paint the figure's skin.
  expect(result.bodyColorAfter).toEqual(result.bodyColorBefore);
});

test('toggle off removes figures; the choice survives a reload', async ({ page }) => {
  test.setTimeout(60_000); // boots the app twice
  await boot(page);
  await setup(page);
  await enableFigures(page);
  await page.reload({ waitUntil: 'load' });
  await waitUntil(page, assetsLoaded);
  await expect(page.locator('#figuresVisibleToggle')).toBeChecked();
  await setup(page);
  await waitUntil(page, figuresReady);
  await expectFigures(page, true);

  await page.locator('#figuresVisibleToggle').uncheck();
  await expectFigures(page, false);
});
