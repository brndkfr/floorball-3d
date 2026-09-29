// A-BACK-018 / A-BACK-021: pass arrow when a frame changes the ball carrier,
// plus pass timing. rAF is paused in unfocused Playwright tabs, so the spec
// drives tickActors()/tickChoreo()/tickPassOverlay() directly.

import { test, expect, waitForAssets } from './fixtures.js';

async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
}

async function tick(page) {
  await page.evaluate(async () => {
    const { tickActors } = await import('/src/authoring/actors.js');
    const { tickChoreo } = await import('/src/authoring/choreograph.js');
    const { tickPassOverlay } = await import('/src/authoring/pass-overlay.js');
    tickActors();
    tickChoreo();
    tickPassOverlay();
  });
}

async function passArrow(page) {
  return page.evaluate(async () => {
    const { scene } = await import('/src/scene.js');
    const arrow = scene.getObjectByName('passArrow');
    if (!arrow) return null;
    arrow.geometry.computeBoundingBox();
    const bb = arrow.geometry.boundingBox;
    return { visible: arrow.visible, minX: bb.min.x, maxX: bb.max.x };
  });
}

test.describe('A-BACK-018 choreograph pass-arrow preview', () => {
  test('shows an arrow from old to new carrier, keeps it after commit, hides it on the first frame', async ({ page }) => {
    await bootApp(page);

    const ids = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { spawnChip } = await import('/src/authoring/chips.js');
      const { setBallCarrier } = await import('/src/authoring/actors.js');
      ensureDoc().scheme.players = {};
      const a = spawnChip({ team: 1, x: 0, z: 0, number: 1, pushHistory: false });
      const b = spawnChip({ team: 1, x: 6000, z: 0, number: 2, pushHistory: false });
      setBallCarrier(a);
      return { a, b };
    });
    await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length === 2);
    await tick(page);

    await page.locator('#timeline [data-tl="choreo"]').click();
    await tick(page);
    const before = await passArrow(page);
    expect(before?.visible ?? false).toBe(false);

    await page.evaluate(async (b) => {
      const { setBallCarrier } = await import('/src/authoring/actors.js');
      setBallCarrier(b);
    }, ids.b);
    await tick(page);

    const after = await passArrow(page);
    expect(after?.visible).toBe(true);
    // Trimmed by the chip display radius (500 mm) at both carrier ends.
    expect(after.minX).toBeGreaterThan(400);
    expect(after.maxX).toBeLessThan(5600);

    await page.locator('#timeline [data-tl="choreo"]').click();
    await tick(page);
    expect((await passArrow(page)).visible).toBe(true);   // the pass is saved in the frame now
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    await tick(page);
    expect((await passArrow(page)).visible).toBe(false);  // no pass arrives in frame 1
  });

  test('Inspector "Pass to" buttons hand the ball to a teammate', async ({ page }) => {
    await bootApp(page);
    const ids = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { spawnChip } = await import('/src/authoring/chips.js');
      const { setBallCarrier } = await import('/src/authoring/actors.js');
      ensureDoc().scheme.players = {};
      const a = spawnChip({ team: 1, x: 5000, z: 15000, number: 7, pushHistory: false });
      const b = spawnChip({ team: 1, x: 9000, z: 20000, number: 9, pushHistory: false });
      spawnChip({ team: 2, x: 7000, z: 18000, number: 4, pushHistory: false });
      setBallCarrier(a);
      return { a, b };
    });
    await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
    await page.evaluate(async () => {
      const { selectObject } = await import('/src/selection.js');
      const { state } = await import('/src/state.js');
      selectObject(state.ballGroup);
    });
    const buttons = page.locator('#inspectorPassTo [data-pass-to]');
    await expect(buttons).toHaveCount(1);   // only #9: the carrier and the opponent are excluded
    await expect(buttons.first()).toHaveText('#9');
    await buttons.first().click();
    const carrier = await page.evaluate(async () => (await import('/src/authoring/actors.js')).getBallCarrier());
    expect(carrier).toBe(ids.b);
    await expect(page.locator('#inspectorPassTo [data-pass-to]').first()).toHaveText('#7');
  });

  test('playback flies the ball from the old carrier to the new one', async ({ page }) => {
    await bootApp(page);
    await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
    const zAt = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { spawnChip } = await import('/src/authoring/chips.js');
      const { setBallCarrier, tickActors } = await import('/src/authoring/actors.js');
      const { duplicateFrame, selectFrame } = await import('/src/authoring/frames.js');
      const { seekTo, stop } = await import('/src/authoring/playback.js');
      const { state } = await import('/src/state.js');
      ensureDoc().scheme.players = {};
      const a = spawnChip({ team: 1, x: 0, z: 10000, number: 7, pushHistory: false });
      const b = spawnChip({ team: 1, x: 0, z: 20000, number: 9, pushHistory: false });
      setBallCarrier(a);
      tickActors();
      duplicateFrame(0, 1);
      selectFrame(1);
      setBallCarrier(b);
      tickActors();
      const out = {};
      for (const ms of [0, 500, 750, 1000]) { seekTo(ms); out[ms] = Math.round(state.ballGroup.position.z); }
      stop();
      return out;
    });
    // A-BACK-021: released at the default 50%; 10 m at 15 m/s is late, so it lands at the frame end.
    expect(zAt[0]).toBe(10250);
    expect(zAt[500]).toBe(10250);
    expect(zAt[750]).toBe(15250);
    expect(zAt[1000]).toBe(20250);
  });

  test('the carrier chip offers "Pass to" too; other chips do not', async ({ page }) => {
    await bootApp(page);
    const ids = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { spawnChip } = await import('/src/authoring/chips.js');
      const { setBallCarrier } = await import('/src/authoring/actors.js');
      ensureDoc().scheme.players = {};
      const a = spawnChip({ team: 1, x: 0, z: 15000, number: 7, pushHistory: false });
      const b = spawnChip({ team: 1, x: 3000, z: 20000, number: 9, pushHistory: false });
      setBallCarrier(a);
      return { a, b };
    });
    await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length === 2);
    const select = (id) => page.evaluate(async (id) => {
      const { selectObject } = await import('/src/selection.js');
      const { state } = await import('/src/state.js');
      selectObject(state.chipGroups.find((g) => g.userData.chip?.id === id));
    }, id);
    await select(ids.b);
    await expect(page.locator('#inspectorPassTo')).toHaveCount(0);
    await select(ids.a);
    await page.locator('#inspectorPassTo [data-pass-to]', { hasText: '#9' }).click();
    expect(await page.evaluate(async () => (await import('/src/authoring/actors.js')).getBallCarrier())).toBe(ids.b);
    await expect(page.locator('#inspectorPassTo')).toHaveCount(0);   // #7 no longer carries
  });
});
