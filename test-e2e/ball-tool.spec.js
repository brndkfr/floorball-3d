// A-BACK-026: the palette's Ball tool places the match ball; extra balls via flyout / Shift+click.

import { test, expect } from './fixtures.js';

async function boot(page) {
  // help.js shows the first-visit tip from an 800 ms setTimeout, over the
  // middle of the rink. Dismissing it only "if it is already there" raced
  // under load: the tip appeared after the check and swallowed the rink
  // clicks below. Mark onboarding done before any app script runs instead,
  // so the tip never shows. (No reloads in this spec, so seeding on every
  // navigation is fine.)
  await page.addInitScript(() => localStorage.setItem('floorball-3d:onboarded', '1'));
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
}

// One Team-1 chip (#7) at (x, z), no carrier, top-down view.
async function setup(page, { x = 3000, z = 24000 } = {}) {
  const id = await page.evaluate(async ({ x, z }) => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { spawnChip } = await import('/src/authoring/chips.js');
    const { setBallCarrier } = await import('/src/authoring/actors.js');
    const { enterTopDown, isTopDown, resetTopDownView } = await import('/src/authoring/topdown-camera.js');
    const doc = ensureDoc();
    doc.scheme.players = {};
    doc.scheme.balls.extras = [];
    (await import('/src/authoring/balls.js')).rebuildBallsFromDoc();
    setBallCarrier(null);
    // Match ball far from every click target below, so a stale ball can't pass by accident.
    doc.scheme.balls.main = { x: 6000, z: 32000, carrier: null };
    (await import('/src/authoring/actors.js')).applyActorsFromScheme();
    const id = spawnChip({ team: 1, x, z, number: 7, pushHistory: false });
    if (!isTopDown()) enterTopDown();
    resetTopDownView();
    return id;
  }, { x, z });
  await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length === 1);
  return id;
}

async function screenOf(page, x, z) {
  return page.evaluate(async ([x, z]) => {
    const THREE = await import('three');
    const { renderer } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const v = new THREE.Vector3(x, 0, z).project(state.activeCamera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top };
  }, [x, z]);
}

const balls = (page) => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  const b = state.doc.scheme.balls;
  return { main: { ...b.main }, extras: (b.extras || []).map((e) => ({ ...e })), frame: state.doc.currentFrame };
});

async function clickRink(page, x, z, opts = {}) {
  const p = await screenOf(page, x, z);
  await page.mouse.move(p.x, p.y);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (opts.shift) await page.keyboard.up('Shift');
}

const pickTool = (page, tool) => page.evaluate(async (t) => (await import('/src/authoring/dock.js')).activateTool(t), tool);

test.describe('Ball tool (A-BACK-026)', () => {
  test('palette Ball button activates the match-ball tool', async ({ page }) => {
    await boot(page);
    await page.locator('#toolPalette > .tp-group > button[data-tool="ball"]').click();
    expect(await page.evaluate(async () => (await import('/src/state.js')).state.activeTool)).toBe('ball');
  });

  test('click on the floor moves the match ball there, no extra ball is created', async ({ page }) => {
    await boot(page);
    await setup(page);
    await pickTool(page, 'ball');
    await clickRink(page, -2000, 20000);
    await expect.poll(async () => (await balls(page)).main.x).toBeCloseTo(-2000, -3);
    const b = await balls(page);
    expect(b.main.z).toBeCloseTo(20000, -3);
    expect(b.main.carrier).toBeNull();
    expect(b.extras).toHaveLength(0);
  });

  test('click on a chip hands that player the ball', async ({ page }) => {
    await boot(page);
    const id = await setup(page);
    await pickTool(page, 'ball');
    await clickRink(page, 3000, 24000);
    await expect.poll(async () => (await balls(page)).main.carrier).toBe(id);
  });

  test('floor click detaches a carried ball', async ({ page }) => {
    await boot(page);
    const id = await setup(page);
    await page.evaluate(async (id) => (await import('/src/authoring/actors.js')).setBallCarrier(id), id);
    await pickTool(page, 'ball');
    await clickRink(page, -2000, 20000);
    await expect.poll(async () => (await balls(page)).main.carrier).toBeNull();
    expect((await balls(page)).main.x).toBeCloseTo(-2000, -3);
  });

  test('Shift+click and the Extra ball flyout drop extra balls, the match ball stays put', async ({ page }) => {
    await boot(page);
    await setup(page);
    const before = (await balls(page)).main;
    await pickTool(page, 'ball');
    await clickRink(page, -2000, 20000, { shift: true });
    await expect.poll(async () => (await balls(page)).extras.length).toBe(1);

    await page.locator('#toolPalette > .tp-group > button[data-tool="ball"]').hover();
    await page.locator('#toolPalette .tp-submenu button[data-tool="ball-extra"]').click();
    await clickRink(page, 3000, 24000);   // over the chip: still an extra, not a hand-off
    await expect.poll(async () => (await balls(page)).extras.length).toBe(2);
    const after = await balls(page);
    expect(after.main.x).toBe(before.x);
    expect(after.main.z).toBe(before.z);
    expect(after.main.carrier).toBeNull();
  });

  test('placing only changes the current frame', async ({ page }) => {
    await boot(page);
    await setup(page);
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).duplicateFrame());
    const frame0 = await page.evaluate(async () => ({ ...(await import('/src/state.js')).state.doc.frames[0].scheme.balls.main }));
    await pickTool(page, 'ball');
    await clickRink(page, -2000, 20000);
    await expect.poll(async () => (await balls(page)).main.x).toBeCloseTo(-2000, -3);
    expect((await balls(page)).frame).toBe(1);
    const still = await page.evaluate(async () => ({ ...(await import('/src/state.js')).state.doc.frames[0].scheme.balls.main }));
    expect(still.x).toBe(frame0.x);
    expect(still.z).toBe(frame0.z);
  });

  test('one undo reverts a placement', async ({ page }) => {
    await boot(page);
    await setup(page);
    await page.evaluate(async () => (await import('/src/authoring/history.js')).pushHistory());
    const before = (await balls(page)).main;
    await pickTool(page, 'ball');
    await clickRink(page, -2000, 20000);
    await expect.poll(async () => (await balls(page)).main.x).toBeCloseTo(-2000, -3);
    await page.evaluate(async () => (await import('/src/authoring/history.js')).undo());
    await expect.poll(async () => (await balls(page)).main.x).toBeCloseTo(before.x, 0);
  });

  test('Layers panel lists the match ball with its carrier, click selects it', async ({ page }) => {
    await boot(page);
    const id = await setup(page);
    await page.evaluate(async (id) => (await import('/src/authoring/actors.js')).setBallCarrier(id), id);
    const row = page.locator('#layersPanel [data-match-ball]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Match ball');
    await expect(row).toContainText('#7');
    await expect(row.locator('.lp-trash')).toHaveCount(0);
    await row.click();
    expect(await page.evaluate(async () => { const { state } = await import('/src/state.js'); return state.selected === state.ballGroup; })).toBe(true);
  });

  test('"Make match ball" on an extra swaps position and colour with the match ball', async ({ page }) => {
    await boot(page);
    await setup(page);
    const start = (await balls(page)).main;
    await page.evaluate(async () => {
      const { spawnBall } = await import('/src/authoring/balls.js');
      const { selectObject } = await import('/src/selection.js');
      const { state } = await import('/src/state.js');
      spawnBall({ x: -4000, z: 18000, color: '#aa66ff', pushHistory: false });
      selectObject(state.extraBalls[0]);
    });
    await page.locator('#inspector button', { hasText: 'Make match ball' }).click();
    await expect.poll(async () => (await balls(page)).main.x).toBeCloseTo(-4000, 0);
    const b = await balls(page);
    expect(b.main.z).toBeCloseTo(18000, 0);
    expect(b.main.color).toBe('#aa66ff');
    expect(b.extras).toHaveLength(1);
    expect(b.extras[0].x).toBeCloseTo(start.x, 0);
    expect(b.extras[0].z).toBeCloseTo(start.z, 0);
    expect(b.extras[0].color).toBeUndefined();
    expect(await page.evaluate(async () => { const { state } = await import('/src/state.js'); return state.selected === state.ballGroup; })).toBe(true);
  });
});
