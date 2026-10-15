// S-BACK-029 H3: zone and arrow labels are Meshes with a CanvasTexture, and
// disposeObject() used to free maps on sprites only - so every updateShape()
// (each opacity-slider tick), undo and frame switch leaked a GPU texture.
// Counts live textures via renderer.info, which only a real WebGL context has.

import { test, expect, waitForAssets } from './fixtures.js';

test('rebuilding a labelled zone and arrow does not leak textures', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
  await waitForAssets(page);

  const counts = await page.evaluate(async () => {
    const { renderer, scene } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const { addShape, updateShape, rebuildShapesFromDoc } = await import('/src/authoring/shapes.js');
    const render = () => renderer.render(scene, state.activeCamera);
    const pts = [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 0, z: 4000 }];
    const zone = addShape({ type: 'zone', points: pts, label: 'Slot', color: '#ffb347' });
    const arrow = addShape({ type: 'arrow', points: [{ x: 0, z: 0 }, { x: 5000, z: 2000 }], label: 'Pass', color: '#ffb347', width: 80 });
    // Two identical rounds of 40 rebuilds. A leak adds >= 1 texture per
    // rebuild, so >= 40 per round; an unrelated one-off upload (an asset
    // or label arriving mid-test, which made a single before/after compare
    // flaky) shows up at most once and is absorbed by round 1.
    const round = () => {
      for (let i = 0; i < 20; i++) {
        updateShape(zone, { opacity: 0.2 + i * 0.01 });
        updateShape(arrow, { width: 80 + i });
        render();
      }
      rebuildShapesFromDoc();
      render();
      return renderer.info.memory.textures;
    };
    render();
    const afterRound1 = round();
    const afterRound2 = round();
    return { afterRound1, afterRound2 };
  });

  // Tolerance well below one texture per rebuild (40 per round).
  expect(counts.afterRound2 - counts.afterRound1).toBeLessThan(5);
});
