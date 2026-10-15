// A-BACK-032: animated player figures. During playback each figure blends
// idle / walk / jog / sprint by its chip's speed, steps in time with the
// distance covered, and faces its run. The pose is a pure function of the
// playback time, so seekTo() (and the MP4 export, which renders right after
// it) is repeatable.

import { test, expect, waitUntil, waitForAssets } from './fixtures.js';

// One Team-1 chip that runs 10 m along +x in 2 s (5 m/s: jog), figures on, 3D view.
async function setup(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const chips = await import('/src/authoring/chips.js');
    const frames = await import('/src/authoring/frames.js');
    const td = await import('/src/authoring/topdown-camera.js');
    const doc = ensureDoc();
    doc.scheme.players = {};
    chips.rebuildFromDoc();
    const id = chips.spawnChip({ team: 1, x: 0, z: 20000, number: 7, pushHistory: false });
    frames.duplicateFrame(0);
    frames.setFrameDuration(0, 2000);
    const p1 = frames.getFrames()[1].scheme.players[id];
    p1.x = 10000;
    if (td.isTopDown()) td.exitTopDown();
    (await import('/src/authoring/figures.js')).setFiguresEnabled(true);
  });
  await waitUntil(page, async () => (await import('/src/authoring/figures.js')).figuresLoaded());
  await page.evaluate(async () => (await import('/src/authoring/figures.js')).tickFigures());
}

// Pose snapshot right after seekTo(ms) - no tick in between, like export.js.
async function poseAt(page, ms) {
  return page.evaluate(async (ms) => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { seekTo } = await import('/src/authoring/playback.js');
    if (ms != null) seekTo(ms);
    const fig = state.chipGroups[0].userData.figure;
    const q = (name) => fig.getObjectByName(name).quaternion.toArray().map((v) => +v.toFixed(5));
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fig.getWorldQuaternion(new THREE.Quaternion()));
    const w = Object.fromEntries(Object.entries(fig.userData.anim.actions).map(([k, a]) => [k, +a.getEffectiveWeight().toFixed(3)]));
    return { thigh: q('thigh_l'), upperarm: q('upperarm_r'), yaw: Math.atan2(fwd.x, fwd.z), weights: w };
  }, ms);
}

test('playback drives a jog, repeatably, facing the run', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await setup(page);

  const a = await poseAt(page, 500);
  const b = await poseAt(page, 800);
  const a2 = await poseAt(page, 500);

  expect(a.weights.jog).toBe(1);           // 5 m/s sits in the jog band
  expect(a.thigh).not.toEqual(b.thigh);    // legs move between the two times
  expect(a2.thigh).toEqual(a.thigh);       // same time -> same pose
  expect(a2.upperarm).toEqual(a.upperarm);
  expect(a.yaw).toBeCloseTo(Math.PI / 2, 2); // running along +x
  expect(pageErrors).toEqual([]);
});

test('outside playback the figure stands in the idle pose, facing the chip angle', async ({ page }) => {
  await setup(page);
  await poseAt(page, 1000);
  const idle = await page.evaluate(async () => {
    (await import('/src/authoring/playback.js')).stop();
    const { poseFigures } = await import('/src/authoring/figures.js');
    poseFigures();
    return null;
  });
  const p = await poseAt(page, null);
  expect(p.weights).toEqual({ idle: 1, walk: 0, jog: 0, sprint: 0 });
  expect(p.yaw).toBeCloseTo(0, 3);
  expect(idle).toBeNull();
});

test('past the last frame the figure comes to rest', async ({ page }) => {
  await setup(page);
  const p = await poseAt(page, 99999);
  expect(p.weights.idle).toBe(1);
});
