// A-BACK-039: the Swiss Way tactical zones are layers - one row per zone in
// the Layers panel with its own eye toggle - instead of one View checkbox
// with a legend. Which zones show is saved with the project.
import { test, expect, waitForAssets } from './fixtures.js';

const ZONE_LABELS = ['naher Slot', 'hoher Slot', 'Tasche (pocket)', 'Playmaker Position', 'Zentrallinie'];

async function boot(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
}

const docZones = (page) => page.evaluate(async () => (await import('/src/state.js')).state.doc.zones);
const meshVisible = (page) => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  const out = {};
  for (const c of state.tacticalZones?.children || []) out[c.name] = c.visible;
  return out;
});
const zoneRow = (page, label) => page.locator('#layersPanel .lp-row[data-zone]').filter({ hasText: label });

test('one Layers row per zone, all off by default; no View checkbox or legend', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#tacticalCheckbox')).toHaveCount(0);
  await expect(page.locator('#legend')).toHaveCount(0);
  const rows = page.locator('#layersPanel .lp-row[data-zone]');
  await expect(rows.locator('.lp-name')).toHaveText(ZONE_LABELS);
  await expect(rows.locator('.lp-eye[aria-pressed="true"]')).toHaveCount(0);
  await expect.poll(async () => Object.keys(await meshVisible(page)).length).toBe(5);
  expect(Object.values(await meshVisible(page))).toEqual([false, false, false, false, false]);
});

test('the eye shows just that zone, saves it with the project and undoes', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => Object.keys(await meshVisible(page)).length).toBe(5);
  await zoneRow(page, 'Tasche').locator('.lp-eye').click();
  await expect(zoneRow(page, 'Tasche').locator('.lp-eye')).toHaveAttribute('aria-pressed', 'true');
  expect(await docZones(page)).toEqual(['pocket']);
  expect(await meshVisible(page)).toEqual({ ZentralLine: false, SlotNear: false, SlotHigh: false, Pocket: true, Playmaker: false });

  // saved with the project: survives a reload
  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect.poll(async () => (await meshVisible(page)).Pocket).toBe(true);
  expect(await docZones(page)).toEqual(['pocket']);

  // undo puts it back
  await zoneRow(page, 'naher Slot').locator('.lp-eye').click();
  expect(await docZones(page)).toEqual(['slotNear', 'pocket']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => docZones(page)).toEqual(['pocket']);
  await expect.poll(async () => (await meshVisible(page)).SlotNear).toBe(false);
});
