// A-BACK-052: the goalie's Inspector has a Goalie section with an EN / DE
// switch. The switch changes the section's text and is remembered per
// browser. Later goalie steps (zone card A-BACK-048, KATA rows A-BACK-046)
// extend this spec with their own text.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.goalies.A && !!state.goalies.B;
  });
}

const selectGoalie = (page, letter = 'A') => page.evaluate(async (l) => {
  const { selectObject } = await import('/src/selection.js');
  const { state } = await import('/src/state.js');
  selectObject(state.goalies[l]);
}, letter);

const section = (page) => page.locator('#inspectorBody .goalie-section');
const langRadio = (page, name) => section(page).getByRole('radiogroup', { name: /Language|Sprache/ }).getByRole('radio', { name, exact: true });

test('selecting a goalie shows the Goalie section in English on an English browser', async ({ page }) => {
  await boot(page);
  await expect(section(page)).toHaveCount(0);
  await selectGoalie(page);
  await expect(section(page)).toBeVisible();
  await expect(langRadio(page, 'EN')).toHaveAttribute('aria-checked', 'true');
  await expect(langRadio(page, 'DE')).toHaveAttribute('aria-checked', 'false');
  await expect(section(page)).toContainText('Positioning after the J+S / swiss unihockey goalie module.');
  const link = section(page).getByRole('link', { name: 'Open the module' });
  await expect(link).toHaveAttribute('href', /goalies-positionierung/);
  await expect(link).toHaveAttribute('target', '_blank');
});

test('DE switches the text, and the choice survives a reload', async ({ page }) => {
  await boot(page);
  await selectGoalie(page, 'B');
  await langRadio(page, 'DE').click();
  await expect(langRadio(page, 'DE')).toHaveAttribute('aria-checked', 'true');
  await expect(section(page)).toContainText('Lernmodul für Goalies');
  await expect(section(page).getByRole('link', { name: 'Zum Lernmodul' })).toBeVisible();

  await boot(page);
  await selectGoalie(page);
  await expect(langRadio(page, 'DE')).toHaveAttribute('aria-checked', 'true');
  await expect(section(page)).toContainText('Lernmodul für Goalies');

  await langRadio(page, 'EN').click();
  await expect(section(page)).toContainText('goalie module');
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.goalieLang'))).toBe('en');
});

test.describe('on a German browser', () => {
  test.use({ locale: 'de-CH' });
  test('the first default is German', async ({ page }) => {
    await boot(page);
    await selectGoalie(page);
    await expect(langRadio(page, 'DE')).toHaveAttribute('aria-checked', 'true');
  });
});
