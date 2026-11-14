// A-BACK-040 step 2: the 3D camera is an orbit rig. Left-drag turns around
// the floor point the camera looks at, right / middle drag and Shift +
// left-drag slide that point, the wheel moves closer or away (the FOV no
// longer changes), WASD slides the point too.

import { test, expect, waitUntil, waitForAssets } from './fixtures.js';

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
    chips.spawnChip({ team: 1, x: -4000, z: 20000, number: 7, pushHistory: false });
    if (td.isTopDown()) td.exitTopDown();
    document.getElementById('resetViewBtn').click();
  });
  await waitUntil(page, async () => (await import('/src/state.js')).state.chipGroups.length === 1);
}

// The rig is read from the camera itself (not from scene.js helpers), so
// the spec checks what is on screen.
async function readRig(page) {
  return page.evaluate(async () => {
    const { camera } = await import('/src/scene.js');
    const { cameraToRig } = await import('/src/orbit-math.js');
    const rig = cameraToRig({
      x: camera.position.x, y: camera.position.y, z: camera.position.z,
      yaw: camera.rotation.y - Math.PI, pitch: camera.rotation.x,
    });
    return { ...rig, fov: camera.fov, camX: camera.position.x, camY: camera.position.y, camZ: camera.position.z };
  });
}

// Window pixel of a floor point, and whether the canvas is what is there.
async function screenOf(page, x, z) {
  return page.evaluate(async ({ x, z }) => {
    const THREE = await import('three');
    const { camera, renderer } = await import('/src/scene.js');
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, 0, z).project(camera);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return { x: sx, y: sy, onCanvas: document.elementFromPoint(sx, sy) === renderer.domElement };
  }, { x, z });
}

async function drag(page, from, dx, dy, { button = 'left', shift = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up({ button });
  if (shift) await page.keyboard.up('Shift');
}

const EMPTY = { x: 3000, z: 22000 };   // floor with nothing on it

test('left-drag on empty floor turns the camera around its target', async ({ page }) => {
  await boot(page);
  const before = await readRig(page);
  const from = await screenOf(page, EMPTY.x, EMPTY.z);
  expect(from.onCanvas).toBe(true);
  await drag(page, from, 120, 30);
  const after = await readRig(page);
  expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(0.2);
  expect(after.pitch).toBeLessThan(before.pitch);
  expect(Math.abs(after.tx - before.tx)).toBeLessThan(5);
  expect(Math.abs(after.tz - before.tz)).toBeLessThan(5);
  expect(Math.abs(after.dist - before.dist)).toBeLessThan(5);
  // the camera itself moved (an orbit, not a head turn)
  expect(Math.hypot(after.camX - before.camX, after.camZ - before.camZ)).toBeGreaterThan(500);
});

test('the wheel moves the camera closer and away; the FOV stays', async ({ page }) => {
  await boot(page);
  const before = await readRig(page);
  const at = await screenOf(page, EMPTY.x, EMPTY.z);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -300);
  const closer = await readRig(page);
  expect(closer.dist).toBeLessThan(before.dist * 0.8);
  expect(closer.fov).toBe(before.fov);
  // the floor point under the cursor stays under the cursor
  const still = await screenOf(page, EMPTY.x, EMPTY.z);
  expect(Math.hypot(still.x - at.x, still.y - at.y)).toBeLessThan(3);
  await page.mouse.wheel(0, 600);
  expect((await readRig(page)).dist).toBeGreaterThan(closer.dist * 1.5);
});

for (const [name, opts] of [['right-drag', { button: 'right' }], ['middle-drag', { button: 'middle' }], ['Shift + left-drag', { shift: true }]]) {
  test(`${name} slides the floor under the cursor`, async ({ page }) => {
    await boot(page);
    const before = await readRig(page);
    const from = await screenOf(page, EMPTY.x, EMPTY.z);
    await drag(page, from, 90, 40, opts);
    const after = await readRig(page);
    expect(Math.hypot(after.tx - before.tx, after.tz - before.tz)).toBeGreaterThan(300);
    expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(after.pitch - before.pitch)).toBeLessThan(1e-6);
    expect(Math.abs(after.dist - before.dist)).toBeLessThan(5);
    // the grabbed point followed the pointer
    const now = await screenOf(page, EMPTY.x, EMPTY.z);
    expect(Math.hypot(now.x - (from.x + 90), now.y - (from.y + 40))).toBeLessThan(4);
  });
}

test('a click still selects a chip, and a right-click still sends it somewhere', async ({ page }) => {
  await boot(page);
  const before = await readRig(page);
  const chip = await screenOf(page, -4000, 20000);
  await page.mouse.click(chip.x, chip.y);
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.selected === state.chipGroups[0];
  })).toBe(true);
  const to = await screenOf(page, EMPTY.x, EMPTY.z);
  await page.mouse.click(to.x, to.y, { button: 'right' });
  const pos = await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const p = Object.values(ensureDoc().scheme.players)[0];
    return { x: p.x, z: p.z };
  });
  expect(Math.hypot(pos.x - EMPTY.x, pos.z - EMPTY.z)).toBeLessThan(200);
  const after = await readRig(page);
  expect(Math.abs(after.tx - before.tx) + Math.abs(after.tz - before.tz) + Math.abs(after.yaw - before.yaw)).toBeLessThan(1e-6);
});

test('W and D slide the target forward and to the right', async ({ page }) => {
  await boot(page);
  const before = await readRig(page);
  // rAF can stall in a background tab: drive the tick directly.
  const step = (key) => page.evaluate(async (key) => {
    const { keysPressed, handleKeyboardMovement } = await import('/src/controls.js');
    keysPressed.add(key);
    handleKeyboardMovement(0.25);
    keysPressed.delete(key);
  }, key);
  await step('w');
  const fwd = await readRig(page);
  // default view looks along -X
  expect(fwd.tx).toBeLessThan(before.tx - 300);
  expect(Math.abs(fwd.tz - before.tz)).toBeLessThan(5);
  expect(Math.abs(fwd.camY - before.camY)).toBeLessThan(1);
  await step('d');
  const right = await readRig(page);
  expect(Math.abs(right.tz - fwd.tz)).toBeGreaterThan(300);
  expect(Math.abs(right.dist - before.dist)).toBeLessThan(5);
});

test('2D and back keeps the orbited pose; Reset view restores the default', async ({ page }) => {
  await boot(page);
  const start = await readRig(page);
  const from = await screenOf(page, EMPTY.x, EMPTY.z);
  await drag(page, from, -150, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.wheel(0, -200);
  const moved = await readRig(page);
  await page.evaluate(async () => {
    const td = await import('/src/authoring/topdown-camera.js');
    td.enterTopDown();
    td.exitTopDown();
  });
  const back = await readRig(page);
  // restored through the quaternion, so the yaw may come back a full turn off
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (const k of ['tx', 'tz', 'pitch', 'dist']) expect(Math.abs(back[k] - moved[k])).toBeLessThan(0.5);
  expect(turn(back.yaw, moved.yaw)).toBeLessThan(1e-4);
  // a further drag continues from that pose (no jump back to an old yaw)
  await drag(page, from, 10, 0);
  expect(turn((await readRig(page)).yaw, moved.yaw)).toBeLessThan(0.1);
  await page.evaluate(() => document.getElementById('resetViewBtn').click());
  const reset = await readRig(page);
  for (const k of ['tx', 'tz', 'pitch', 'dist', 'fov']) expect(Math.abs(reset[k] - start[k])).toBeLessThan(0.5);
  expect(turn(reset.yaw, start.yaw)).toBeLessThan(1e-4);
});
