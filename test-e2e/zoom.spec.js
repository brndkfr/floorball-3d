// A-BACK-040 step 8: zoom feels the same in 2D and 3D, with a mouse wheel,
// a touchpad (many small wheel events; pinch arrives as wheel + ctrlKey)
// and a two-finger pinch. The point under the cursor (or between the
// fingers) stays where it is.

import { test, expect, waitForAssets } from './fixtures.js';

async function boot(page, { topDown }) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await page.evaluate(async (topDown) => {
    const td = await import('/src/authoring/topdown-camera.js');
    if (td.isTopDown()) td.exitTopDown();
    document.getElementById('resetViewBtn').click();
    if (topDown) td.enterTopDown();
  }, topDown);
}

// Floor point under window pixel (sx, sy) for the active camera, and
// whether the canvas is what is there.
async function floorUnder(page, sx, sy) {
  return page.evaluate(async ({ sx, sy }) => {
    const THREE = await import('three');
    const { renderer } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1), cam);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return { x: hit.x, z: hit.z, onCanvas: document.elementFromPoint(sx, sy) === renderer.domElement };
  }, { sx, sy });
}

async function screenOf(page, p) {
  return page.evaluate(async ({ x, z }) => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(x, 0, z).project(cam);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }, p);
}

// 2D: the ortho zoom; 3D: how far the camera is from its target.
async function zoomLevel(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { topDownCamera, getCameraRig } = await import('/src/scene.js');
    return state.activeCamera === topDownCamera ? topDownCamera.zoom : 1 / getCameraRig().dist;
  });
}

// Two-finger pinch on the canvas, centred on (cx, cy): fingers from `from`
// px apart to `to` px apart, in a few moves.
async function pinch(page, cx, cy, from, to) {
  await page.evaluate(async ({ cx, cy, from, to }) => {
    const { renderer } = await import('/src/scene.js');
    const el = renderer.domElement;
    const touches = (gap) => [
      new Touch({ identifier: 1, target: el, clientX: cx - gap / 2, clientY: cy }),
      new Touch({ identifier: 2, target: el, clientX: cx + gap / 2, clientY: cy }),
    ];
    const fire = (type, list) => el.dispatchEvent(new TouchEvent(type, {
      touches: list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true,
    }));
    fire('touchstart', touches(from));
    for (let i = 1; i <= 4; i++) fire('touchmove', touches(from + ((to - from) * i) / 4));
    fire('touchend', []);
  }, { cx, cy, from, to });
}

const spot = (page) => {
  const vp = page.viewportSize();
  return { x: Math.round(vp.width * 0.62), y: Math.round(vp.height * 0.42) };
};

test('2D: the wheel zooms about the cursor, not the window centre', async ({ page }) => {
  await boot(page, { topDown: true });
  const at = spot(page);
  const p = await floorUnder(page, at.x, at.y);
  expect(p.onCanvas).toBe(true);
  const before = await zoomLevel(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -300);
  expect(await zoomLevel(page)).toBeGreaterThan(before * 1.3);
  const still = await screenOf(page, p);
  expect(Math.hypot(still.x - at.x, still.y - at.y)).toBeLessThan(2);
});

for (const topDown of [true, false]) {
  test(`${topDown ? '2D' : '3D'}: ten small wheel events zoom as much as one big one`, async ({ page }) => {
    await boot(page, { topDown });
    const at = spot(page);
    await page.mouse.move(at.x, at.y);
    const z0 = await zoomLevel(page);
    await page.mouse.wheel(0, -300);
    const big = (await zoomLevel(page)) / z0;
    await boot(page, { topDown });
    await page.mouse.move(at.x, at.y);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -30);
    const small = (await zoomLevel(page)) / z0;
    expect(big).toBeGreaterThan(1.3);
    expect(Math.abs(small / big - 1)).toBeLessThan(0.02);
  });
}

test('3D: a touchpad pinch (Ctrl + small wheel deltas) zooms in properly', async ({ page }) => {
  await boot(page, { topDown: false });
  const at = spot(page);
  await page.mouse.move(at.x, at.y);
  const z0 = await zoomLevel(page);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  expect((await zoomLevel(page)) / z0).toBeGreaterThan(1.3);
});

for (const topDown of [true, false]) {
  test(`${topDown ? '2D' : '3D'}: pinching zooms about the point between the fingers`, async ({ page }) => {
    await boot(page, { topDown });
    const at = spot(page);
    const p = await floorUnder(page, at.x, at.y);
    expect(p.onCanvas).toBe(true);
    const z0 = await zoomLevel(page);
    await pinch(page, at.x, at.y, 100, 200);
    // fingers twice as far apart: things twice as big
    expect(Math.abs((await zoomLevel(page)) / z0 - 2)).toBeLessThan(0.05);
    const still = await screenOf(page, p);
    expect(Math.hypot(still.x - at.x, still.y - at.y)).toBeLessThan(3);
  });
}
