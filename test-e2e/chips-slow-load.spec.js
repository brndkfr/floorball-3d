// Chips requested before player_chip.obj has loaded are queued and built when
// it arrives. The queue used to hold player *objects*, and rebuildFromDoc()
// never cleared it, so a chip spawned and then rebuilt (e.g. after a frame
// duplicate moved it) was built twice once the model landed - the first copy
// at the stale position. Under CI load the model can land late, which made
// pass-timing.spec.js read #7 at x=0 instead of 2000. Here the model is held
// back on purpose.
import { test, expect } from './fixtures.js';

test('chips queued before the chip model loads are built once, from the current frame', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/player_chip.obj*', async (route) => { await held; await route.continue(); });
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);

  const id = await page.evaluate(async () => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { spawnChip, rebuildFromDoc } = await import('/src/authoring/chips.js');
    const { duplicateFrame } = await import('/src/authoring/frames.js');
    ensureDoc().scheme.players = {};
    rebuildFromDoc();
    const id = spawnChip({ team: 1, x: 0, z: 10000, number: 7, pushHistory: false });
    duplicateFrame(0, 1);
    ensureDoc().scheme.players[id].x = 2000;
    rebuildFromDoc();
    return id;
  });
  release();

  await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length > 0);
  await page.waitForTimeout(300);
  const chips = await page.evaluate(async (id) => {
    const { state } = await import('/src/state.js');
    return state.chipGroups.filter((g) => g.userData.chip?.id === id).map((g) => Math.round(g.position.x));
  }, id);
  expect(chips).toEqual([2000]);
});
