// S-BACK-030 steps 1, 2 and 6: the 3D view has a hall backdrop (slate
// background, fog, hall floor), filmic tone mapping and white boards. The top-down
// diagram keeps its flat look: none of that may leak into it.

import { test, expect, waitForAssets } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

async function look(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const { scene, renderer } = await import('/src/scene.js');
    const bg = scene.background;
    let board = null, rail = null;
    scene.traverse((n) => {
      for (const m of [].concat(n.material || [])) {
        if (m.name === 'Board') board = m.color.getHex();
        if (m.name === 'BoardRail') rail = m.color.getHex();
      }
    });
    return {
      filmic: renderer.toneMapping === THREE.ACESFilmicToneMapping,
      noToneMapping: renderer.toneMapping === THREE.NoToneMapping,
      background: bg?.isColor ? bg.getHex() : null,
      fog: !!scene.fog,
      hallFloor: scene.getObjectByName('hallFloor').visible,
      board, rail,
    };
  });
}

test('3D has the hall look; 2D keeps the flat diagram look', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const td = await import('/src/authoring/topdown-camera.js');
    if (td.isTopDown()) td.exitTopDown();
  });
  const in3d = await look(page);
  expect(in3d).toMatchObject({ filmic: true, background: 0x2b313d, fog: true, hallFloor: true });

  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).enterTopDown());
  const in2d = await look(page);
  expect(in2d).toMatchObject({ noToneMapping: true, background: 0x1b1b1f, fog: false, hallFloor: false });

  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).exitTopDown());
  expect(await look(page)).toMatchObject({ filmic: true, background: 0x2b313d, fog: true, hallFloor: true });
});

test('boards are white with a dark top rail', async ({ page }) => {
  await boot(page);
  const { board, rail } = await look(page);
  const luma = (hex) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
  expect(luma(board)).toBeGreaterThan(190);
  expect(luma(rail)).toBeLessThan(80);
});

test('photo-lock still clears the background and switches tone mapping off', async ({ page }) => {
  await boot(page);
  const locked = await page.evaluate(async () => {
    const THREE = await import('three');
    const { scene, renderer } = await import('/src/scene.js');
    const td = await import('/src/authoring/topdown-camera.js');
    const view = await import('/src/authoring/photo-overlay/view.js');
    if (td.isTopDown()) td.exitTopDown();
    view.enterPhoto();
    const during = { background: scene.background, none: renderer.toneMapping === THREE.NoToneMapping, hallFloor: scene.getObjectByName('hallFloor').visible };
    view.exitPhoto();
    return { during, after: { background: scene.background?.getHex(), filmic: renderer.toneMapping === THREE.ACESFilmicToneMapping } };
  });
  expect(locked.during).toEqual({ background: null, none: true, hallFloor: false });
  expect(locked.after).toEqual({ background: 0x2b313d, filmic: true });
});
