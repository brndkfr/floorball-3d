// Regression net for module-init errors that a Node test can't catch:
// a missing export, a null querySelector, or a stray typo that only fires
// when index.html and the whole ES-module graph actually load in a browser.
// The specific failure that motivated this: `photo-overlay.js` declaring
// `effectiveFacingDeg` without `export`, which threw at import time and
// silently blocked every downstream script (rink included). Every other
// e2e spec calls `page.goto('/')` too but none of them fail the test on
// unhandled page errors, so a broken bootstrap slipped through until the
// user opened the app themselves.
import { test, expect } from './fixtures.js';

test('app boots with no page errors and the rink renders', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'load' });

  // Wait for main.js to finish its startup work (loading `rink.obj`,
  // building the scene, populating layer checkboxes). If bootstrap
  // aborted early, none of these will ever appear.
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
  await expect(page.locator('#dockProjectName')).toBeVisible();
  // Plan-mode surfaces owned by side-effect modules (tool-palette.js etc).
  // If the HTML container is deleted, the module's DOM-owning throw fires
  // via `pageerror` below - this visibility check is the belt to that
  // suspender, and specifically fails a silent-no-op regression.
  await expect(page.locator('#toolPalette')).toBeVisible();
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#layersPanel')).toBeVisible();

  // Give any deferred imports a beat to throw, then assert.
  await page.waitForTimeout(300);

  expect(pageErrors, `unhandled page errors during bootstrap:\n${pageErrors.join('\n')}`).toEqual([]);
  // Console errors are noisier (favicon 404, third-party warnings) - only
  // fail on ones that mention our own source paths.
  const ownConsoleErrors = consoleErrors.filter((t) => /\/src\/|photo-overlay|dock\.js|main\.js/.test(t));
  expect(ownConsoleErrors, `own-source console errors during bootstrap:\n${ownConsoleErrors.join('\n')}`).toEqual([]);
});

// Commit 4bcbd41 rewrote index.html / photo-overlay.js from a stale copy and
// silently dropped shipped controls whose modules no-op when the element is
// missing. Pin the ids so a repeat fails here instead of in production.
test('shipped controls are present in the DOM', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
  const ids = [
    // Plan mode
    'saveStatus',                // S-BACK-001
    // Analyze mode (photo overlay)
    'photoStepper',              // B-BUG-002
    'photoStep3PrimaryBtn',
    'photoStep4PrimaryBtn',
    'photoWireframeToggle',      // A-BACK-005
    'photoEstimateFacingsBtn',   // B-PHASE-005
    'photoResetFacingBtn',       // B-PHASE-004
    'photoClearSelFacingBtn',    // B-BACK-002
    'photoFeedbackToggle',
  ];
  for (const id of ids) {
    await expect(page.locator(`#${id}`), `#${id} missing`).toHaveCount(1);
  }
  await expect(page.locator('#timeline [data-tl="choreo"]')).toHaveCount(1); // A-BACK-006
  await expect(page.locator('link[href$="tokens.css"]')).toHaveCount(1);
});

// S-BACK-019: the inline <style> moved to src/app.css and the Broadcast
// tokens + Web Awesome theme mapping were added without changing the look.
// Pins that the moved styles still apply, the new tokens resolve (and flip
// under data-theme="light"), and nothing is fetched from another host
// (no Google Fonts, no Font Awesome kit).
test('stylesheets load from the origin and keep the current look', async ({ page }) => {
  const foreign = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) foreign.push(req.url());
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#toolPalette')).toBeVisible();

  const styles = await page.evaluate(() => {
    const rootVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const active = document.querySelector('#toolPalette button.active');
    const out = {
      hudAccent: rootVar('--hud-accent'),
      paletteActiveBg: active && getComputedStyle(active).backgroundColor,
      teamHome: rootVar('--team-home'),
      fbBrand: rootVar('--fb-brand'),
      fbSurfDark: rootVar('--fb-surf-1'),
    };
    document.documentElement.dataset.theme = 'light';
    out.fbSurfLight = rootVar('--fb-surf-1');
    delete document.documentElement.dataset.theme;
    return out;
  });
  expect(styles).toEqual({
    hudAccent: '#4fe0ff',
    paletteActiveBg: 'rgb(255, 179, 71)',
    teamHome: '#2fbf4e',
    fbBrand: '#2e6bff',
    fbSurfDark: '#15181c',
    fbSurfLight: '#ffffff',
  });
  expect(foreign, `requests to other hosts:\n${foreign.join('\n')}`).toEqual([]);
});
