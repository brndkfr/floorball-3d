// A-BACK-040 step 7: "Follow" in the recorder makes the 3D camera's target
// follow the ball in playback (follow-ball.js followTargetAt); direction and
// distance stay as they were at the start. A frame camera keyframe wins.
// Driven with seekTo(): rAF can stall in a background tab.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => !!(await import('/src/state.js')).state.ballGroup);
  // #7 at z 10 m passes to #9 at z 20 m in frame 1 -> 2.
  await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const chips = await import('/src/authoring/chips.js');
    const { setBallCarrier, tickActors } = await import('/src/authoring/actors.js');
    const { duplicateFrame, selectFrame } = await import('/src/authoring/frames.js');
    const td = await import('/src/authoring/topdown-camera.js');
    if (td.isTopDown()) td.exitTopDown();
    document.getElementById('resetViewBtn').click();
    ensureDoc().scheme.players = {};
    chips.rebuildFromDoc();
    const a = chips.spawnChip({ team: 1, x: 0, z: 10000, number: 7, pushHistory: false });
    const b = chips.spawnChip({ team: 1, x: 0, z: 20000, number: 9, pushHistory: false });
    setBallCarrier(a);
    tickActors();
    duplicateFrame(0, 1);
    selectFrame(1);
    setBallCarrier(b);
    tickActors();
    selectFrame(0);
  });
}

// Camera target and distance after seeking to `ms`, plus where follow
// should put the target.
async function seek(page, ms) {
  return page.evaluate(async (ms) => {
    const { seekTo } = await import('/src/authoring/playback.js');
    const { getFrames } = await import('/src/authoring/frames.js');
    const { followTargetAt } = await import('/src/authoring/follow-ball.js');
    const { getCameraRig, camera } = await import('/src/scene.js');
    seekTo(ms);
    const rig = getCameraRig();
    return { tx: rig.tx, tz: rig.tz, dist: rig.dist, yaw: rig.yaw, want: followTargetAt(getFrames(), ms), camZ: camera.position.z };
  }, ms);
}

const followBtn = (page) => page.locator('#timeline [data-tl="follow"]');

test('Follow moves the camera target with the ball; direction and distance stay', async ({ page }) => {
  await boot(page);
  const start = await seek(page, 0);
  await page.evaluate(async () => (await import('/src/authoring/playback.js')).stop());
  await followBtn(page).click();
  await expect(followBtn(page)).toHaveAttribute('aria-pressed', 'true');
  const early = await seek(page, 200);
  const late = await seek(page, 1000);
  for (const s of [early, late]) {
    expect(Math.hypot(s.tx - s.want.x, s.tz - s.want.z)).toBeLessThan(5);
    expect(Math.abs(s.dist - start.dist)).toBeLessThan(5);
    expect(Math.abs(s.yaw - start.yaw)).toBeLessThan(1e-3);
  }
  expect(late.tz).toBeGreaterThan(early.tz + 2000);   // it went with the pass
  // Stop puts the camera back where it was before playback
  await page.evaluate(async () => (await import('/src/authoring/playback.js')).stop());
  const back = await page.evaluate(async () => (await import('/src/scene.js')).getCameraRig());
  expect(Math.hypot(back.tx - start.tx, back.tz - start.tz)).toBeLessThan(5);
});

test('a frame camera keyframe wins over Follow; with Follow off the camera stays put', async ({ page }) => {
  await boot(page);
  await followBtn(page).click();
  const keyed = await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const doc = ensureDoc();
    const cam = { mode: 'perspective', position: [0, 9000, -6000], quaternion: [0, 1, 0, 0], fov: 45 };
    doc.frames[0].camera = cam;
    doc.frames[1].camera = cam;
    return cam;
  });
  const s = await seek(page, 500);
  expect(Math.abs(s.camZ - keyed.position[2])).toBeLessThan(1);

  await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const doc = ensureDoc();
    delete doc.frames[0].camera;
    delete doc.frames[1].camera;
    (await import('/src/authoring/playback.js')).stop();
  });
  await followBtn(page).click();
  await expect(followBtn(page)).toHaveAttribute('aria-pressed', 'false');
  const a = await seek(page, 200);
  const b = await seek(page, 1000);
  expect(Math.hypot(a.tx - b.tx, a.tz - b.tz)).toBeLessThan(1);
});
