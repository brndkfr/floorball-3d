// The two fixed goals and their goalies are Layers rows: an eye to show /
// hide (saved with the project in doc.hiddenFixed), click to select, and
// double-click to rename a goal. They replace the View panel checkboxes.
import { test, expect, waitForAssets } from './fixtures.js';

async function boot(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
}

const row = (page, key) => page.locator(`#layersPanel .lp-row[data-fixed="${key}"]`);
const hiddenFixed = (page) => page.evaluate(async () => (await import('/src/state.js')).state.doc.hiddenFixed);
const meshVisible = (page) => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  return {
    goalA: state.goalInstances[0]?.visible, goalB: state.goalInstances[1]?.visible,
    goalieA: state.goalies.A?.visible, goalieB: state.goalies.B?.visible,
  };
});
const ALL_SHOWN = { goalA: true, goalB: true, goalieA: true, goalieB: true };

test('goals and goalies are Layers rows, all shown; the View checkboxes are gone', async ({ page }) => {
  await boot(page);
  for (const id of ['goalsCheckbox', 'goalieCheckboxA', 'goalieCheckboxB']) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  await expect(row(page, 'goalA').locator('.lp-name')).toHaveText('Home');
  await expect(row(page, 'goalB').locator('.lp-name')).toHaveText('Away');
  await expect(row(page, 'goalieA').locator('.lp-name')).toHaveText('Home goalie');
  await expect(row(page, 'goalieB').locator('.lp-name')).toHaveText('Away goalie');
  await expect(page.locator('#layersPanel .lp-row[data-fixed] .lp-eye[aria-pressed="true"]')).toHaveCount(4);
  await expect.poll(() => meshVisible(page)).toEqual(ALL_SHOWN);
});

test('the eye hides just that object, saves it with the project and undoes', async ({ page }) => {
  await boot(page);
  await expect.poll(() => meshVisible(page)).toEqual(ALL_SHOWN);

  await row(page, 'goalieB').locator('.lp-eye').click();
  await expect(row(page, 'goalieB').locator('.lp-eye')).toHaveAttribute('aria-pressed', 'false');
  expect(await hiddenFixed(page)).toEqual(['goalieB']);
  expect(await meshVisible(page)).toEqual({ ...ALL_SHOWN, goalieB: false });

  // switching the goalie model keeps the hidden one hidden
  await page.locator('#goalieModelSelect').selectOption('blocky');
  await expect.poll(() => meshVisible(page)).toEqual({ ...ALL_SHOWN, goalieB: false });

  // saved with the project: survives a reload
  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect.poll(() => meshVisible(page)).toEqual({ ...ALL_SHOWN, goalieB: false });

  // undo puts it back
  await row(page, 'goalA').locator('.lp-eye').click();
  expect(await hiddenFixed(page)).toEqual(['goalA', 'goalieB']);
  expect((await meshVisible(page)).goalA).toBe(false);
  await page.keyboard.press('Control+z');
  await expect.poll(() => hiddenFixed(page)).toEqual(['goalieB']);
  await expect.poll(async () => (await meshVisible(page)).goalA).toBe(true);
});

test('clicking a row selects the goal or goalie; hiding it deselects', async ({ page }) => {
  await boot(page);
  const selected = () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    if (!state.selected) return null;
    if (state.selected === state.goalies.A) return 'goalieA';
    if (state.selected === state.goalies.B) return 'goalieB';
    const i = state.goalInstances.indexOf(state.selected);
    return i === 0 ? 'goalA' : i === 1 ? 'goalB' : 'other';
  });

  await row(page, 'goalieA').click();
  expect(await selected()).toBe('goalieA');
  await expect(row(page, 'goalieA')).toHaveClass(/selected/);

  await row(page, 'goalB').click();
  expect(await selected()).toBe('goalB');
  await expect(row(page, 'goalB')).toHaveClass(/selected/);

  await row(page, 'goalB').locator('.lp-eye').click();
  expect(await selected()).toBe(null);
});

test('double-clicking a goal name renames it, and its goalie and shot button follow', async ({ page }) => {
  await boot(page);
  await row(page, 'goalA').click();
  await expect(row(page, 'goalA')).toHaveClass(/selected/);
  await row(page, 'goalA').locator('.lp-name').dblclick();
  const input = row(page, 'goalA').locator('input.lp-name-input');
  await input.fill('Jets');
  await input.press('Enter');
  await expect(row(page, 'goalA').locator('.lp-name')).toHaveText('Jets');
  const label = await page.evaluate(async () => (await import('/src/authoring/goals.js')).fixedGoalDataFor('A').label);
  expect(label).toBe('Jets');
  await expect(row(page, 'goalieA').locator('.lp-name')).toHaveText('Jets goalie');

  await page.evaluate(async () => {
    const { spawnChip } = await import('/src/authoring/chips.js');
    const { setBallCarrier } = await import('/src/authoring/actors.js');
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    const id = spawnChip({ team: 1, x: 0, z: 20000, number: 9, pushHistory: false });
    setBallCarrier(id);
    selectObject(state.chipGroups.find((g) => g.userData.chip?.id === id));
  });
  await expect(page.locator('#inspectorShoot [data-shoot]')).toHaveText(['Shoot at Jets', 'Shoot at Away']);
});
