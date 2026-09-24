// A-BACK-021: pass timing - release point (marker + slider), pass speed, lane check, playback trail.
// rAF may be paused in Playwright, so the spec drives the tick functions directly.

import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  const tip = page.locator('#onboardingTip button', { hasText: 'Got it' });
  if (await tip.count()) await tip.first().click();
  await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
}

async function tick(page) {
  await page.evaluate(async () => {
    (await import('/src/authoring/actors.js')).tickActors();
    (await import('/src/authoring/pass-overlay.js')).tickPassOverlay();
  });
}

// Frame 1: #7 (ball) at (0, 10000), #9 at (0, 15000). Frame 2: #7 ran to (2000, 10000), #9 has the ball.
// Optional opponent #4 at `defender`.
async function setupPass(page, { defender = null, nineZ = 15000 } = {}) {
  const ids = await page.evaluate(async ({ defender, nineZ }) => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { spawnChip, rebuildFromDoc } = await import('/src/authoring/chips.js');
    const { setBallCarrier } = await import('/src/authoring/actors.js');
    const { duplicateFrame } = await import('/src/authoring/frames.js');
    const { enterTopDown, isTopDown, resetTopDownView } = await import('/src/authoring/topdown-camera.js');
    ensureDoc().scheme.players = {};
    const a = spawnChip({ team: 1, x: 0, z: 10000, number: 7, pushHistory: false });
    const b = spawnChip({ team: 1, x: 0, z: nineZ, number: 9, pushHistory: false });
    const d = defender ? spawnChip({ team: 2, x: defender.x, z: defender.z, number: 4, pushHistory: false }) : null;
    setBallCarrier(a);
    duplicateFrame(0, 1);
    ensureDoc().scheme.players[a].x = 2000;
    rebuildFromDoc();
    setBallCarrier(b);
    if (!isTopDown()) enterTopDown();
    resetTopDownView();
    return { a, b, d };
  }, { defender, nineZ });
  await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length >= 2);
  await tick(page);
  return ids;
}

const storedPass = (page) => page.evaluate(async () => (await import('/src/state.js')).state.doc.scheme.balls.main.pass ?? null);
const selectChip = (page, id) => page.evaluate(async (id) => {
  const { selectObject } = await import('/src/selection.js');
  const { state } = await import('/src/state.js');
  selectObject(state.chipGroups.find((g) => g.userData.chip?.id === id));
}, id);

async function screenOf(page, name) {
  return page.evaluate(async (name) => {
    const { scene, renderer } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const o = scene.getObjectByName(name);
    const v = o.position.clone().project(state.activeCamera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top, wx: o.position.x, wz: o.position.z };
  }, name);
}

async function worldToScreen(page, x, z) {
  return page.evaluate(async ([x, z]) => {
    const THREE = await import('three');
    const { renderer } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const v = new THREE.Vector3(x, 0, z).project(state.activeCamera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top };
  }, [x, z]);
}

test.describe('A-BACK-021 pass timing', () => {
  test('Inspector release slider + speed are stored in the frame, move the marker, and survive a reload', async ({ page }) => {
    await boot(page);
    const ids = await setupPass(page);
    let marker = await screenOf(page, 'passReleaseMarker');
    expect(Math.round(marker.wx)).toBe(1000);   // default 50% of #7's 0 -> 2000 run

    await selectChip(page, ids.b);
    const slider = page.locator('#passReleaseSlider');
    await expect(slider).toHaveValue('50');
    await slider.fill('20');
    await page.locator('#passSpeedInput').fill('25');
    await page.locator('#passSpeedInput').blur();
    await tick(page);
    expect(await storedPass(page)).toEqual({ releaseT: 0.2, speedMps: 25 });
    marker = await screenOf(page, 'passReleaseMarker');
    expect(Math.round(marker.wx)).toBe(400);   // default bezier controls make the run linear in t

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
    expect(await storedPass(page)).toEqual({ releaseT: 0.2, speedMps: 25 });
  });

  test('dragging the release marker along the run sets the release point', async ({ page }) => {
    await boot(page);
    await setupPass(page);
    await page.evaluate(async () => { const { state } = await import('/src/state.js'); const { scene, renderer } = await import('/src/scene.js'); renderer.render(scene, state.activeCamera); });
    const from = await screenOf(page, 'passReleaseMarker');
    const to = await worldToScreen(page, 1800, 10000);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const pass = await storedPass(page);
    expect(pass.releaseT).toBeGreaterThan(0.75);
    await tick(page);
    const marker = await screenOf(page, 'passReleaseMarker');
    expect(marker.wx).toBeGreaterThan(1500);
  });

  test('the marker can be grabbed slightly off-centre (a real user miss of ~12 px)', async ({ page }) => {
    await boot(page);
    await setupPass(page);
    await page.evaluate(async () => { const { state } = await import('/src/state.js'); const { scene, renderer } = await import('/src/scene.js'); renderer.render(scene, state.activeCamera); });
    const from = await screenOf(page, 'passReleaseMarker');
    const to = await worldToScreen(page, 1800, 10000);
    await page.mouse.move(from.x + 9, from.y - 8);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    expect((await storedPass(page))?.releaseT).toBeGreaterThan(0.75);
  });

  test('an opponent in the lane turns the arrow red and the Inspector names him', async ({ page }) => {
    await boot(page);
    // Pass runs (1000, 10250) -> (0, 15250); at z=12750 the line is at x=500.
    const ids = await setupPass(page, { defender: { x: 500, z: 12750 } });
    const color = await page.evaluate(async () => (await import('/src/scene.js')).scene.getObjectByName('passArrow').material.color.getHex());
    const { VECTOR_PASS_BLOCKED } = await page.evaluate(async () => ({ VECTOR_PASS_BLOCKED: (await import('/src/tokens.js')).VECTOR_PASS_BLOCKED }));
    expect(color).toBe(VECTOR_PASS_BLOCKED.hex);
    await selectChip(page, ids.a);
    await expect(page.locator('#passLaneStatus')).toHaveText('Blocked by #4');
  });

  test('a pass too long for the frame shows a late warning', async ({ page }) => {
    await boot(page);
    const ids = await setupPass(page, { nineZ: 35000 });
    await selectChip(page, ids.b);
    await expect(page.locator('#passLateStatus')).toContainText('Late: needs');
  });

  test('playback keeps the ball with the passer until release and draws a trail in flight', async ({ page }) => {
    await boot(page);
    await setupPass(page);
    const r = await page.evaluate(async () => {
      const { play, seekTo, stop } = await import('/src/authoring/playback.js');
      const { tickPassOverlay } = await import('/src/authoring/pass-overlay.js');
      const { scene } = await import('/src/scene.js');
      const { state } = await import('/src/state.js');
      play();
      seekTo(250);                  // before the 50% release: with #7 on his run
      const early = { x: state.ballGroup.position.x, z: state.ballGroup.position.z };
      tickPassOverlay();
      const trailEarly = scene.getObjectByName('passTrail').visible;
      seekTo(600);                  // in flight
      tickPassOverlay();
      const trailMid = scene.getObjectByName('passTrail').visible;
      stop();
      return { early, trailEarly, trailMid };
    });
    expect(Math.round(r.early.z)).toBe(10250);                 // ball = #7 + carry offset
    expect(r.early.x).toBeGreaterThan(0);                      // #7 is already running
    expect(r.trailEarly).toBe(false);
    expect(r.trailMid).toBe(true);
  });
});
