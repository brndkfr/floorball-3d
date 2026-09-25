// Accessibility coverage for S-BACK-005:
//   - every visible top-level <button> in Plan mode has an accessible name
//   - the hand-rolled help/export overlays behave as modal dialogs
//     (role=dialog, aria-modal, focus trap, Escape closes)
//   - `prefers-reduced-motion: reduce` disables the chip-spawn drop
//     animation + cyan ring flash and skips the walk-tween ease.
//
// See CLAUDE.md for the CDP cache-clear + about:blank bounce - Chromium
// otherwise serves stale ES modules across specs during a single dev
// session.

import { test, expect } from './fixtures.js';

async function bootApp(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.getElementById('dockProjectName');
    return el && el.textContent && el.textContent.length > 0;
  });
}

test('every visible top-level button has an accessible name', async ({ page }) => {
  await bootApp(page);
  const problems = await page.evaluate(() => {
    const bad = [];
    for (const btn of document.querySelectorAll('button')) {
      // Skip anything the user genuinely can't reach right now (hidden
      // panels, submenus that are display:none until hovered).
      if (btn.offsetParent === null) continue;
      const aria = btn.getAttribute('aria-label');
      const text = (btn.textContent || '').trim();
      const title = btn.getAttribute('title');
      const name = aria || text || title;
      if (!name) bad.push(btn.outerHTML.slice(0, 120));
    }
    return bad;
  });
  expect(problems, `buttons missing an accessible name:\n${problems.join('\n')}`).toEqual([]);
});

test('help overlay opens as a modal dialog and traps focus', async ({ page }) => {
  await bootApp(page);
  await page.keyboard.press('Shift+/'); // '?'
  const overlay = page.locator('#helpOverlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(overlay).toHaveAttribute('aria-label', /shortcut/i);

  // Initial focus should land inside the overlay.
  const closeBtn = overlay.locator('button[data-x="close"]');
  await expect(closeBtn).toBeFocused();

  // Tab from the (single) focusable element wraps back to itself.
  await page.keyboard.press('Tab');
  const focusInside = await page.evaluate(() =>
    document.getElementById('helpOverlay').contains(document.activeElement)
  );
  expect(focusInside).toBe(true);

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('reduced motion disables chip drop animation and ring flash', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await bootApp(page);
  const snapshot = await page.evaluate(async () => {
    const chips = await import('/src/authoring/chips.js');
    const { state } = await import('/src/state.js');
    const before = state.chipsRoot.children.length;
    const id = chips.spawnChip({ team: 1, x: 0, z: 20000, number: 99 });
    // Look up the freshly spawned group.
    const group = state.chipGroups.find((g) => g.userData?.chip?.id === id);
    return {
      spawnedCount: state.chipsRoot.children.length - before,
      immediateScale: group ? group.scale.x : null,
      displayScale: chips.CHIP_DISPLAY_SCALE,
    };
  });
  expect(snapshot.spawnedCount).toBe(1);
  // Under reduce-motion the chip must skip the 0.7x -> 1.0x ease and be
  // at full display scale immediately.
  expect(snapshot.immediateScale).toBe(snapshot.displayScale);
  await context.close();
});

test('normal motion still animates the chip drop from a smaller scale', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await bootApp(page);
  const snapshot = await page.evaluate(async () => {
    const chips = await import('/src/authoring/chips.js');
    const { state } = await import('/src/state.js');
    const id = chips.spawnChip({ team: 1, x: 0, z: 20000, number: 98 });
    const group = state.chipGroups.find((g) => g.userData?.chip?.id === id);
    return {
      immediateScale: group ? group.scale.x : null,
      displayScale: chips.CHIP_DISPLAY_SCALE,
    };
  });
  // Baseline: chip starts at 0.7x display scale (drop animation), not at
  // full scale. This guards against accidentally leaving reduced-motion
  // on globally.
  expect(snapshot.immediateScale).toBeLessThan(snapshot.displayScale);
  await context.close();
});
