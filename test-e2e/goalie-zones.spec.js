// A-BACK-048: the goalie zone layer. In Train it comes on, the Train panel
// shows the ball's zone card and a Zones toggle; in Plan it is a Layers
// panel row, off by default and remembered per browser. updateGoalieZones()
// is called directly: rAF-driven frames are unreliable in Playwright tabs.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A;
  });
}

const railBtn = (page, mode) => page.locator(`#appRail [data-mode="${mode}"]`);
const card = (page) => page.locator('#trainPanel .gz');
const toggle = (page) => page.locator('#trainPanel').getByRole('button', { name: /^(Zones|Zonen)$/ });

// Put the ball somewhere and run one zone update; returns what the layer shows.
const ballAt = (page, x, z) => page.evaluate(async ([bx, bz]) => {
  const { state, getBallWorldCenter } = await import('/src/state.js');
  const { ensureDoc } = await import('/src/authoring/doc.js');
  const { applyActorsFromScheme } = await import('/src/authoring/actors.js');
  const { updateGoalieZones } = await import('/src/goalie-zones-layer.js');
  if (bx != null) {
    ensureDoc().scheme.balls.main = { x: bx, z: bz, carrier: null };
    applyActorsFromScheme();
  }
  updateGoalieZones(getBallWorldCenter());
  const layer = state.goalieZonesLayer;
  return { shown: state.goalieZonesShown, visible: !!layer?.visible, zone: state.goalieZone?.zone ?? null, goal: state.goalieZone?.goal ?? null, meshes: layer?.children.filter((c) => c.isMesh).length ?? 0 };
}, [x, z]);

test('Train switches the zones on and shows the card for the ball\'s zone', async ({ page }) => {
  await boot(page);
  expect((await ballAt(page)).visible).toBe(false);          // off in Plan by default
  await railBtn(page, 'train').click();
  const r = await ballAt(page);
  expect(r).toMatchObject({ shown: true, visible: true, zone: 'slot', goal: 'A', meshes: 5 });
  await expect(card(page)).toContainText('Slot');
  await expect(card(page)).toContainText('Full alert!');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the card follows the ball through the zones, at both ends', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  for (const [x, z, zone, goal, name] of [
    [0, 2000, 'passing', 'A', 'Passing-first zone'],
    [7000, 12000, 'danger', 'A', 'Danger zone'],
    [0, 19000, 'attention', 'A', 'Attention zone'],
    [0, 22000, 'attention', 'B', 'Attention zone'],    // nearer goal B now (18 m from its end): zones flip
    [0, 37000, 'passing', 'B', 'Passing-first zone'],
  ]) {
    expect(await ballAt(page, x, z)).toMatchObject({ zone, goal });
    await expect(card(page).locator('.gz-name')).toHaveText(name);
  }
});

test('the Zones toggle hides the floor zones but keeps the card', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await ballAt(page)).visible).toBe(false);
  await expect(card(page)).toContainText('Slot');
  await toggle(page).click();
  expect((await ballAt(page)).visible).toBe(true);
});

test('the card is in German when the app is', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await page.locator('#langBtn').click();
  await page.locator('#langMenu').getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await ballAt(page, 7000, 12000);
  await expect(card(page).locator('.gz-name')).toHaveText('Danger-Zone');
  await expect(card(page)).toContainText('Hochspannung!');
  await expect(toggle(page)).toHaveText('Zonen');
});

test('in Plan the zones are a Layers row, remembered per browser, and Train does not change that choice', async ({ page }) => {
  await boot(page);
  const row = page.locator('#layersPanel .lp-row[data-goalie-zones]');
  await expect(row).toBeVisible();
  await expect(row.locator('.lp-eye')).toHaveAttribute('aria-pressed', 'false');
  await row.click();
  await expect(row.locator('.lp-eye')).toHaveAttribute('aria-pressed', 'true');
  expect((await ballAt(page)).visible).toBe(true);

  await boot(page);                                       // remembered
  expect((await ballAt(page)).visible).toBe(true);
  await row.click();                                      // off again
  expect((await ballAt(page)).visible).toBe(false);

  await railBtn(page, 'train').click();                   // Train turns them on...
  expect((await ballAt(page)).visible).toBe(true);
  await railBtn(page, 'plan').click();                    // ...and Plan gets its own choice back
  expect((await ballAt(page)).visible).toBe(false);
  await expect(row.locator('.lp-eye')).toHaveAttribute('aria-pressed', 'false');
});

// Zone labels: standing tags that face the camera (A-BACK-048 follow-up).
const tags = (page) => page.locator('#zoneLabels:not([hidden]) .zl-tag:not([hidden])');
const labelsToggle = (page) => page.locator('#trainPanel').getByRole('button', { name: /^(Labels|Beschriftung)$/ });
const placeLabels = (page) => page.evaluate(async () => {
  const { getBallWorldCenter } = await import('/src/state.js');
  (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
  (await import('/src/goalie-zone-labels.js')).placeZoneLabels();
});

test('in Train the zone tags stand on the rink; the ball\'s zone tag carries its motto and depth', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await railBtn(page, 'train').click();
  await placeLabels(page);
  expect(await tags(page).count()).toBeGreaterThanOrEqual(3);
  const current = page.locator('#zoneLabels .zl-tag.current');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('data-zone', 'slot');
  await expect(current).toContainText('Slot');
  await expect(current).toContainText('Full alert!');
  await expect(current).toContainText('3.8 – 10.9 m');
  await expect(labelsToggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the tags stay on their spot when the camera turns', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await railBtn(page, 'train').click();
  const spot = () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { zoneLabelAnchors } = await import('/src/goalie-zones.js');
    const a = zoneLabelAnchors('A').find((t) => t.key === 'slot');
    const v = state.ballGroup.position.clone().set(a.x, 0, a.z).project(state.activeCamera);
    const r = document.querySelector('canvas[data-engine^="three"]').getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });
  for (const turn of [0, 0.35, -0.7]) {   // cumulative: 0, +20 deg, then -20 deg from the start
    await page.evaluate(async (dy) => {
      const { state } = await import('/src/state.js');
      const { setCameraLook } = await import('/src/scene.js');
      setCameraLook(state.camYaw + dy, state.camPitch);
    }, turn);
    await placeLabels(page);
    const tag = page.locator('#zoneLabels .zl-tag.current');
    const p = await spot();
    const b = await tag.boundingBox();
    expect(Math.abs(b.x + b.width / 2 - p.x)).toBeLessThan(4);           // centred over its spot
    expect(Math.abs(b.y + b.height - p.y)).toBeLessThan(40);              // standing on it (stem below)
  }
});

test('the Labels toggle hides the tags, is remembered, and the tags go with the zones', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await placeLabels(page);
  await labelsToggle(page).click();
  await expect(labelsToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await placeLabels(page);
  await expect(tags(page)).toHaveCount(0);

  await boot(page);
  await railBtn(page, 'train').click();
  await placeLabels(page);
  await expect(tags(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.goalieZoneLabels'))).toBe('0');
  await labelsToggle(page).click();
  await placeLabels(page);
  expect(await tags(page).count()).toBeGreaterThanOrEqual(3);

  await toggle(page).click();                                     // Zones off: their tags go too
  await placeLabels(page);
  await expect(tags(page)).toHaveCount(0);
});
