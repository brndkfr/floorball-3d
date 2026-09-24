// Browser-level integration tests for A-BACK-001 drag-to-reorder in
// the layers panel. See CLAUDE.md for why the reload dance is needed.

import { test, expect } from './fixtures.js';

async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
  const tip = page.locator('#onboardingTip button', { hasText: 'Got it' });
  if (await tip.count()) await tip.first().click();
}

test.describe('A-BACK-001 layers-panel drag reorder', () => {
  test('drag-reorders chips within a team section and persists the new key order', async ({ page }) => {
    await bootApp(page);

    await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { spawnChip } = await import('/src/authoring/chips.js');
      const doc = ensureDoc();
      doc.scheme.players = {};
      spawnChip({ team: 1, x: 0, z: 0, number: 1, pushHistory: false });
      spawnChip({ team: 1, x: 1000, z: 0, number: 2, pushHistory: false });
      spawnChip({ team: 1, x: 2000, z: 0, number: 3, pushHistory: false });
    });

    const rows = page.locator('#layersPanel .lp-section-body > .lp-row:not([data-match-ball])');   // match ball row is always there (A-BACK-026)
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('#1');
    await expect(rows.nth(2)).toContainText('#3');

    // Drag #1 to the very bottom.
    await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 20, y: 14 } });

    await expect(rows.nth(0)).toContainText('#2');
    await expect(rows.nth(1)).toContainText('#3');
    await expect(rows.nth(2)).toContainText('#1');

    const order = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      return Object.values(ensureDoc().scheme.players).map((p) => p.number);
    });
    expect(order).toEqual(['2', '3', '1']);
  });

  test('drag-reorders shapes within a section and rebuilds the scene in the new order', async ({ page }) => {
    await bootApp(page);

    await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      const { addShape } = await import('/src/authoring/shapes.js');
      ensureDoc().scheme.shapes = [];
      addShape({ type: 'zone', kind: 'rect', label: 'Alpha', x: 0, z: 0, w: 1000, h: 1000, color: '#ff0000' });
      addShape({ type: 'zone', kind: 'rect', label: 'Bravo', x: 2000, z: 0, w: 1000, h: 1000, color: '#00ff00' });
      addShape({ type: 'zone', kind: 'rect', label: 'Charlie', x: 4000, z: 0, w: 1000, h: 1000, color: '#0000ff' });
    });

    const rows = page.locator('#layersPanel .lp-section-body > .lp-row:not([data-match-ball])');   // match ball row is always there (A-BACK-026)
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Alpha');

    await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 20, y: 14 } });

    const order = await page.evaluate(async () => {
      const { ensureDoc } = await import('/src/authoring/doc.js');
      return ensureDoc().scheme.shapes.map((s) => s.label);
    });
    expect(order).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });
});
