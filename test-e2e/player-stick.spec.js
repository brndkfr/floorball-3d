// A-BACK-034: the 3D figures hold a floorball stick in both hands, blade on
// the floor, in a ready stance layered on the upright gait clips
// (figure-stick.js). Checks the geometry numerically - hands on their grips,
// blade on the floor - in idle and during playback at jog and sprint speed,
// and the per-player Stick L / R toggle. Poses go through seekTo(): rAF is
// unreliable in Playwright tabs (CLAUDE.md).

import { test, expect, waitUntil, waitForAssets } from './fixtures.js';

const MAX_GRIP_GAP_MM = 50;
const MIN_SPACING_MM = 100; // stick-pose.js MIN_HAND_SPACING_MM

// One chip running `dx` mm along +x over a 2 s frame (0 = standing).
async function setup(page, dx, hand = 'L') {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.evaluate(async (dx) => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const chips = await import('/src/authoring/chips.js');
    const frames = await import('/src/authoring/frames.js');
    const td = await import('/src/authoring/topdown-camera.js');
    const doc = ensureDoc();
    doc.scheme.players = {};
    chips.rebuildFromDoc();
    const id = chips.spawnChip({ team: 1, x: 0, z: 10000, number: 7, pushHistory: false });
    frames.duplicateFrame(0);
    frames.setFrameDuration(0, 2000);
    frames.getFrames()[1].scheme.players[id].x = dx;
    if (td.isTopDown()) td.exitTopDown();
    (await import('/src/authoring/figures.js')).setFiguresEnabled(true);
  }, dx);
  await page.evaluate(async (hand) => {
    const chips = await import('/src/authoring/chips.js');
    const { state } = await import('/src/state.js');
    chips.updateChipHand(state.chipGroups[0].userData.chip.id, hand);
  }, hand);
  await waitUntil(page, async () => (await import('/src/authoring/figures.js')).figuresLoaded());
  await page.evaluate(async () => (await import('/src/authoring/figures.js')).tickFigures());
}

function measure(page, ms) {
  return page.evaluate(async (ms) => {
    const { state } = await import('/src/state.js');
    const { seekTo } = await import('/src/authoring/playback.js');
    const { stickResiduals } = await import('/src/authoring/figure-stick.js');
    const { stickHand } = await import('/src/authoring/stick-pose.js');
    const { chipDataFor } = await import('/src/authoring/chips.js');
    if (ms != null) seekTo(ms);
    const group = state.chipGroups[0];
    const fig = group.userData.figure;
    const stick = fig.userData.stick;
    const r = stickResiduals(fig, stick, stickHand(chipDataFor(group)));
    return { ...r, mirrored: stick.scale.z < 0, bladeX: stick.position.x };
  }, ms);
}

for (const hand of ['L', 'R']) for (const [gait, dx] of [['standing', 0], ['jog', 10000], ['sprint', 16000]]) {
  test(`${hand} ${gait}: both hands on the stick, blade on the floor`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, dx, hand);
    for (const ms of [null, 300, 700, 1000, 1300, 1700]) {
      const r = await measure(page, ms);
      expect(r.top, `top hand at ${ms} ms`).toBeLessThan(MAX_GRIP_GAP_MM);
      expect(r.bottom, `bottom hand on the shaft at ${ms} ms`).toBeLessThan(MAX_GRIP_GAP_MM);
      expect(r.spacing, `hand spacing at ${ms} ms`).toBeGreaterThanOrEqual(MIN_SPACING_MM - 1);
      expect(Math.abs(r.bladeY), `blade height at ${ms} ms`).toBeLessThan(1);
    }
    // Re-posing the same time gives the same pose (the stance must not compound).
    const a = await measure(page, 700);
    await measure(page, 1300);
    const b = await measure(page, 700);
    expect(b.top).toBeCloseTo(a.top, 3);
    expect(b.bottom).toBeCloseTo(a.bottom, 3);
    expect(errors).toEqual([]);
  });
}

test('Stick L / R in the chip popover mirrors the stick on every frame', async ({ page }) => {
  await setup(page, 0);
  let r = await measure(page, null);
  expect(r.mirrored).toBe(false);
  expect(r.bladeX).toBeGreaterThan(0); // figure-local +X is the figure's left

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { selectObject } = await import('/src/selection.js');
    selectObject(state.chipGroups[0]);
  });
  await page.locator('#chipPopover .pop-chevron').click(); // opens collapsed
  await expect(page.locator('#chipPopover [data-hand="L"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#chipPopover [data-hand="R"]').click();
  await expect(page.locator('#chipPopover [data-hand="R"]')).toHaveAttribute('aria-pressed', 'true');

  const hands = await page.evaluate(async () => {
    const { getFrames } = await import('/src/authoring/frames.js');
    return getFrames().map((f) => Object.values(f.scheme.players)[0].hand);
  });
  expect(hands).toEqual(['R', 'R']);
  await page.evaluate(async () => (await import('/src/authoring/figures.js')).tickFigures());
  r = await measure(page, null);
  expect(r.mirrored).toBe(true);
  expect(r.bladeX).toBeLessThan(0);
  expect(r.top).toBeLessThan(MAX_GRIP_GAP_MM);
  expect(r.bottom).toBeLessThan(MAX_GRIP_GAP_MM);
});

test('the stick is not fetched until figures are switched on', async ({ page }) => {
  const stickRequests = [];
  page.on('request', (req) => { if (req.url().includes('floorball_stick')) stickRequests.push(req.url()); });
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  expect(stickRequests).toEqual([]);
  await page.evaluate(async () => (await import('/src/authoring/figures.js')).setFiguresEnabled(true));
  await waitUntil(page, async () => (await import('/src/authoring/figures.js')).figuresLoaded());
  expect(stickRequests.length).toBeGreaterThan(0);
});
