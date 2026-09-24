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

// Broadcast look (S-BACK-021): chrome uses the --fb-* tokens, Archivo for UI
// text, flat panels (no clip-path / blur), the brand blue marks the active
// tool, and the team colour stays the domain token. Also pins that every
// stylesheet and font loads from the origin (no Google Fonts, no Font
// Awesome kit) and that the tokens flip under data-theme="light".
test('chrome uses the Broadcast tokens and loads nothing from other hosts', async ({ page }) => {
  const foreign = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) foreign.push(req.url());
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#toolPalette')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const styles = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const rootVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const out = {
      bodyBg: cs('body').backgroundColor,
      paletteActiveBg: cs('#toolPalette button.active').backgroundColor,
      paletteActiveFg: cs('#toolPalette button.active').color,
      topbarFont: cs('#appTopbar').fontFamily.split(',')[0].replace(/["']/g, ''),
      panelClip: cs('#inspector').clipPath,
      panelBg: cs('#inspector').backgroundColor,
      archivoLoaded: document.fonts.check('600 12px Archivo'),
      teamHome: rootVar('--team-home'),
      fbSurfDark: rootVar('--fb-surf-1'),
    };
    document.documentElement.dataset.theme = 'light';
    out.fbSurfLight = rootVar('--fb-surf-1');
    delete document.documentElement.dataset.theme;
    return out;
  });
  expect(styles).toEqual({
    bodyBg: 'rgb(13, 15, 18)',          // --fb-ink
    paletteActiveBg: 'rgb(46, 107, 255)', // --fb-brand
    paletteActiveFg: 'rgb(255, 255, 255)',
    topbarFont: 'Archivo',
    panelClip: 'none',
    panelBg: 'rgb(21, 24, 28)',         // --fb-surf-1
    archivoLoaded: true,
    teamHome: '#2fbf4e',
    fbSurfDark: '#15181c',
    fbSurfLight: '#ffffff',
  });
  expect(foreign, `requests to other hosts:\n${foreign.join('\n')}`).toEqual([]);
});

// help.js shows the first-visit tip from an 800 ms timer, over the rink.
// Specs that dismissed it "if already there" raced it under load and lost
// rink clicks to it. fixtures.js marks onboarding done before load unless a
// spec opts in with test.use({ showOnboarding: true }).
test('the onboarding tip stays away unless a spec opts in', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#toolPalette')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('#onboardingTip')).toHaveCount(0);
});

test.describe('with showOnboarding', () => {
  test.use({ showOnboarding: true });
  test('the tip appears on a first visit', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#onboardingTip')).toBeVisible();
  });
});

// Broadcast shell (design canvas "Plan"): 64 px rail with icon + label per
// mode and a 3 px brand bar on the active one; 52 px top bar with the
// project name. Sizes come from web/src/ui/shell-metrics.js.
test('Broadcast shell: rail and top bar geometry', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#appRail button[data-mode="plan"]')).toHaveClass(/active/);
  const shell = await page.evaluate(() => {
    const rail = document.getElementById('appRail').getBoundingClientRect();
    const top = document.getElementById('appTopbar').getBoundingClientRect();
    const active = document.querySelector('#appRail button.active');
    const bar = getComputedStyle(active, '::before');
    return {
      railWidth: Math.round(rail.width),
      topbarHeight: Math.round(top.height),
      topbarLeft: Math.round(top.left),
      barWidth: bar.width,
      barColor: bar.backgroundColor,
      icons: [...document.querySelectorAll('#appRail button[data-mode]')].map((b) => !!b.querySelector('svg') && b.textContent.trim()),
    };
  });
  expect(shell).toEqual({
    railWidth: 64,
    topbarHeight: 52,
    topbarLeft: 64,
    barWidth: '3px',
    barColor: 'rgb(46, 107, 255)',
    icons: ['Plan', 'Analyze', 'Library'],
  });
});

// Specs that spawn chips or read meshes must wait for the models (chips,
// ball, goals, goalie) - chips requested earlier are only built once
// player_chip.obj lands. status.js counts outstanding loads.
test('every expected asset load finishes and the count reaches zero', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(async () => (await import('/src/status.js')).pendingLoads() === 0, null, { timeout: 15000 });
});
