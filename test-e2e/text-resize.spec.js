// Browser-level integration tests for the text-shape resize UI:
// selection shows a dotted outline + 4 corner handles, and the
// Inspector "Size" slider live-updates shape.size.

import { test, expect } from './fixtures.js';

async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
}

test('selecting a text shape adds a dotted outline + 4 corner handles', async ({ page }) => {
  await bootApp(page);
  const result = await page.evaluate(async () => {
    const { addShape } = await import('/src/authoring/shapes.js');
    const { enterTopDown } = await import('/src/authoring/topdown-camera.js');
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    enterTopDown();
    const id = addShape({ type: 'text', text: 'Hello', x: 0, z: 0, color: '#ffd54a' });
    const sprite = state.shapeObjects.find((o) => o.userData.shape?.id === id);
    selectObject(sprite);
    await new Promise((r) => requestAnimationFrame(r));
    const { scene } = await import('/src/scene.js');
    let dashedLines = 0;
    let circleHandles = 0;
    scene.traverse((o) => {
      if (o.type === 'LineSegments' && o.material?.type === 'LineDashedMaterial' && o.visible) dashedLines += 1;
      if (o.type === 'Mesh' && o.geometry?.type === 'CircleGeometry' && o.visible) circleHandles += 1;
    });
    return { dashedLines, circleHandles };
  });
  expect(result.dashedLines).toBeGreaterThanOrEqual(1);
  expect(result.circleHandles).toBe(4);
});

test('Inspector Size slider live-updates shape.size and sprite scale', async ({ page }) => {
  await bootApp(page);
  const id = await page.evaluate(async () => {
    const { addShape } = await import('/src/authoring/shapes.js');
    const { enterTopDown } = await import('/src/authoring/topdown-camera.js');
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    enterTopDown();
    const id = addShape({ type: 'text', text: 'Hello', x: 0, z: 0, color: '#ffd54a' });
    const sprite = state.shapeObjects.find((o) => o.userData.shape?.id === id);
    selectObject(sprite);
    return id;
  });
  const slider = page.locator('#inspector input[type=range]').first();
  await expect(slider).toBeVisible();
  await slider.fill('3000');
  await slider.dispatchEvent('input');
  const scaleY = await page.evaluate(async (shapeId) => {
    const { state } = await import('/src/state.js');
    const sprite = state.shapeObjects.find((o) => o.userData.shape?.id === shapeId);
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const s = ensureDoc().scheme.shapes.find((x) => x.id === shapeId);
    return { spriteScaleY: sprite.scale.y, docSize: s.size };
  }, id);
  expect(scaleY.docSize).toBe(3000);
  expect(scaleY.spriteScaleY).toBe(3000);
});
