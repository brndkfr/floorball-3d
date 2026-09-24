// A-BACK-018: Choreograph mode previews a pass arrow when the draft frame
// changes the ball carrier. rAF is paused in unfocused Playwright tabs, so
// the spec drives tickActors()/tickChoreo() directly.

import { test, expect } from '@playwright/test';

async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
  const tip = page.locator('#onboardingTip button', { hasText: 'Got it' });
  if (await tip.count()) await tip.first().click();
}

async function tick(page) {
  await page.evaluate(async () => {
    const { tickActors } = await import('/src/authoring/actors.js');
    const { tickChoreo } = await import('/src/authoring/choreograph.js');
    tickActors();
    tickChoreo();
  });
}

async function passArrow(page) {
  return page.evaluate(async () => {
    const { scene } = await import('/src/scene.js');
    const arrow = scene.getObjectByName('choreoPassArrow');
    if (!arrow) return null;
    arrow.geometry.computeBoundingBox();
    const bb = arrow.geometry.boundingBox;
    return { visible: arrow.visible, minX: bb.min.x, maxX: bb.max.x };
  });
}

test.describe('A-BACK-018 choreograph pass-arrow preview', () => {
  test('shows an arrow from old to new carrier and removes it on commit', async ({ page }) => {
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
    expect(await passArrow(page)).toBeNull();
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
});
