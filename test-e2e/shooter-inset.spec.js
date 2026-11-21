// A-BACK-047: the shooter's view inset in Train (top-right of the stage,
// the same renderer draws it into a corner) and Auto position (the
// defending goalie to its ideal spot and facing). Functions are called
// directly: rAF frames are unreliable in Playwright tabs.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && state.goalInstances.length === 2 && !!state.goalies.A;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#appRail [data-mode="train"]').click();
}

const inset = (page) => page.locator('#trainPanel #shooterInset');
const tool = (page, name) => page.locator('#trainPanel .kata').getByRole('button', { name, exact: true });

const tick = (page) => page.evaluate(async () => {
  const { state, getBallWorldCenter } = await import('/src/state.js');
  (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
  (await import('/src/shot-readout.js')).updateShotReadout();
  (await import('/src/kata-readout.js')).updateKataReadout();
  (await import('/src/shooter-inset.js')).renderFrame();
  return state.kataReadout?.judged ?? null;
});

test('Train shows the shooter\'s view in the top-right; its camera sits behind the ball looking at the goal', async ({ page }) => {
  await boot(page);
  await tick(page);
  await expect(inset(page)).toBeVisible();
  await expect(inset(page)).toContainText("Shooter's view");
  const stage = await page.locator('#trainPanel').boundingBox();
  const box = await inset(page).boundingBox();
  expect(box.x + box.width).toBeGreaterThan(stage.x + stage.width - 40);
  expect(box.y).toBeLessThan(stage.y + 40);
  const cam = await page.evaluate(async () => {
    const { insetCamera } = await import('/src/shooter-inset.js');
    const { state } = await import('/src/state.js');
    const c = insetCamera();
    const b = state.ballGroup.position;
    const dir = c.getWorldDirection(c.position.clone());
    return { back: Math.hypot(c.position.x - b.x, c.position.z - b.z), dz: dir.z };
  });
  expect(cam.back).toBeLessThan(800);
  expect(cam.dz).toBeLessThan(-0.8);              // looking toward goal A (-z)
});

test('the inset is in the screenshot: its corner of the image is not the main view', async ({ page }) => {
  await boot(page);
  await tick(page);
  const spread = await page.evaluate(async () => {
    const { captureStage, currentStageCrop } = await import('/src/screenshot.js');
    const canvas = await captureStage({ clean: true });
    const crop = currentStageCrop();
    const s = canvas.width / crop.w;
    const r = document.querySelector('#shooterInset .inset-view').getBoundingClientRect();
    const d = canvas.getContext('2d').getImageData(Math.round((r.x - crop.x) * s), Math.round((r.y - crop.y) * s), Math.round(r.width * s), Math.round(r.height * s)).data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; min = Math.min(min, v); max = Math.max(max, v); }
    return max - min;
  });
  expect(spread).toBeGreaterThan(120);             // goal, goalie and floor, not a blank box
});

test('the Shooter\'s view button hides the inset and is remembered', async ({ page }) => {
  await boot(page);
  await tick(page);
  await tool(page, "Shooter's view").click();
  await expect(tool(page, "Shooter's view")).toHaveAttribute('aria-pressed', 'false');
  await expect(inset(page)).toBeHidden();
  await page.reload();
  await boot(page);
  await tick(page);
  await expect(inset(page)).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.shooterInset'))).toBe('0');
});

test('Auto position puts the goalie where every KATA dimension is ok, for a shot and for a pass', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.goalies.A.position.set(2500, 0, 6000);
    state.goalies.A.rotation.y = 1;
  });
  let judged = await tick(page);
  expect(judged.worst).not.toBeNull();
  for (const action of ['Shot', 'Pass']) {
    await page.locator('#trainPanel .kata-action').getByRole('radio', { name: action, exact: true }).click();
    await tool(page, 'Auto position').click();
    judged = await tick(page);
    expect(judged.status).toMatchObject({ placement: 'ok', depth: 'ok', axis: 'ok' });
    await expect(page.locator('#trainHint')).toHaveText('Good position for this situation.');
  }
});

test('the inset stays out of Plan', async ({ page }) => {
  await boot(page);
  await page.locator('#appRail [data-mode="plan"]').click();
  await expect(page.locator('#shooterInset')).toBeHidden();
});

// Resizable: drag the bottom-left corner handle; arrows on the handle too.
const viewBox = (page) => page.locator('#shooterInset .inset-view').boundingBox();
const handle = (page) => page.locator('#shooterInset').getByRole('button', { name: "Resize the shooter's view" });

test('the inset card resizes from its bottom-left corner, is remembered, and stays within limits', async ({ page }) => {
  await boot(page);
  await tick(page);
  const before = await viewBox(page);
  const h = await handle(page).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 120, h.y + h.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const after = await viewBox(page);
  expect(after.width).toBeCloseTo(before.width + 120 + h.width / 2, -1);
  expect(after.height).toBeGreaterThan(before.height + 40);
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);   // still hangs from the top-right
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('floorball3d.shooterInsetSize')));
  expect(stored.w).toBe(Math.round(after.width));

  await page.reload();
  await boot(page);
  await tick(page);
  expect((await viewBox(page)).width).toBeCloseTo(after.width, 0);

  const g = await handle(page).boundingBox();                               // way too big: clamped to 60% of the stage
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x - 3000, g.y + 3000, { steps: 4 });
  await page.mouse.up();
  const stage = await page.locator('#trainPanel').boundingBox();
  const big = await viewBox(page);
  expect(big.width).toBeLessThanOrEqual(Math.round(stage.width * 0.6) + 1);
  expect(big.height).toBeLessThanOrEqual(Math.round(stage.height * 0.6) + 1);
});

test('arrow keys on the handle resize the card in steps', async ({ page }) => {
  await boot(page);
  await tick(page);
  const before = await viewBox(page);
  await handle(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  const after = await viewBox(page);
  expect(after.width).toBeCloseTo(before.width + 20, 0);
  expect(after.height).toBeCloseTo(before.height + 20, 0);
});

test('zone tags and the hint pill never show on top of the inset card', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('floorball3d.shooterInsetSize', JSON.stringify({ w: 520, h: 300 })));
  await boot(page);
  await tool(page, 'Auto position').click();
  const clash = await page.evaluate(async () => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
    (await import('/src/kata-readout.js')).updateKataReadout();
    (await import('/src/goalie-zone-labels.js')).placeZoneLabels();
    (await import('/src/authoring/kata-section.js')).placeTrainHint();
    const card = document.getElementById('shooterInset').getBoundingClientRect();
    const seen = [...document.querySelectorAll('#zoneLabels .zl-tag, #trainHint')]
      .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    return seen.filter((el) => { const r = el.getBoundingClientRect(); return r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top; }).map((el) => el.textContent);
  });
  expect(clash).toEqual([]);
  await expect(page.locator('#trainHint')).toBeVisible();            // the hint moves to the goalie's other side
});
