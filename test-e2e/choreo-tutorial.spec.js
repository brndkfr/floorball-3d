// A-BACK-019: guided Choreo tutorial. rAF can be paused in Playwright, so the
// spec drives tickActors()/tickChoreo() directly after scene mutations.

import { test, expect } from '@playwright/test';

const TUTORIAL_NAME = 'Tutorial: first choreo';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await page.waitForFunction(async () => !!(await import('/src/state.js')).state.ballGroup);
}

async function tick(page) {
  await page.evaluate(async () => {
    (await import('/src/authoring/actors.js')).tickActors();
    (await import('/src/authoring/choreograph.js')).tickChoreo();
  });
}

async function snapshotCurrent(page) {
  return page.evaluate(async () => {
    const s = await import('/src/authoring/storage.js');
    const id = s.getCurrentProjectId();
    return { id, frames: JSON.stringify(s.loadProject(id).frames) };
  });
}

async function projectName(page) {
  return page.evaluate(async () => (await import('/src/state.js')).state.doc.meta.name);
}

const step = (page, name) => page.locator(`#tutorialCard [data-step="${name}"]`);

async function moveSeven(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const id = Object.values(state.doc.scheme.players).find((p) => p.number === '7').id;
    const g = state.chipGroups.find((c) => c.userData.chip?.id === id);
    g.position.z += 3000;
  });
  await tick(page);
}

async function passToNine(page) {
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    const id = Object.values(state.doc.scheme.players).find((p) => p.number === '7').id;
    selectObject(state.chipGroups.find((c) => c.userData.chip?.id === id));
  });
  await page.locator('#inspectorPassTo [data-pass-to]', { hasText: '#9' }).click();
  await tick(page);
}

// #7 is still selected after the pass, so the Inspector shows his outgoing pass timing.
async function chooseRelease(page) {
  await page.locator('#passReleaseSlider').fill('30');
  await tick(page);
}

async function startFromWelcomeTip(page) {
  await boot(page);
  await tick(page);
  const before = await snapshotCurrent(page);
  await page.locator('#onboardingTip [data-x="tutorial"]').click();
  await expect(page.locator('#tutorialCard')).toBeVisible();
  return before;
}

test.describe('A-BACK-019 guided Choreo tutorial', () => {
  test('walks all 6 steps in a separate project and returns to the original untouched', async ({ page }) => {
    const before = await startFromWelcomeTip(page);
    expect(await projectName(page)).toBe(TUTORIAL_NAME);
    await expect(step(page, 'choreo')).toHaveAttribute('data-status', 'active');

    await page.locator('#timeline [data-tl="choreo"]').click();
    await expect(step(page, 'choreo')).toHaveAttribute('data-status', 'complete');
    await expect(step(page, 'move')).toHaveAttribute('data-status', 'active');

    await moveSeven(page);
    await expect(step(page, 'move')).toHaveAttribute('data-status', 'complete');

    await passToNine(page);
    await expect(step(page, 'pass')).toHaveAttribute('data-status', 'complete');
    await expect(step(page, 'release')).toHaveAttribute('data-status', 'active');
    await expect(page.locator('#tutorialCard .tut-hint')).toContainText('orange diamond');

    await chooseRelease(page);
    await expect(step(page, 'release')).toHaveAttribute('data-status', 'complete');
    await expect(step(page, 'commit')).toHaveAttribute('data-status', 'active');

    await page.locator('#choreoCommitBtn').click();
    await expect(step(page, 'play')).toHaveAttribute('data-status', 'active');

    await page.locator('#tutorialCard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(' ');
    await expect(page.locator('#tutorialCard [data-x="back"]')).toBeVisible();
    await page.evaluate(async () => (await import('/src/authoring/playback.js')).stop());

    await page.locator('#tutorialCard [data-x="back"]').click();
    await expect(page.locator('#tutorialCard')).toBeHidden();
    await tick(page);
    const after = await snapshotCurrent(page);
    expect(after.id).toBe(before.id);
    expect(after.frames).toBe(before.frames);
  });

  test('reload mid-tutorial resumes at the first unfinished step', async ({ page }) => {
    await startFromWelcomeTip(page);
    await page.locator('#timeline [data-tl="choreo"]').click();
    await moveSeven(page);
    await passToNine(page);
    await chooseRelease(page);
    await page.locator('#choreoCommitBtn').click();
    await expect(step(page, 'play')).toHaveAttribute('data-status', 'active');

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#tutorialCard')).toBeVisible();
    await expect(step(page, 'release')).toHaveAttribute('data-status', 'complete');
    await expect(step(page, 'commit')).toHaveAttribute('data-status', 'complete');
    await expect(step(page, 'play')).toHaveAttribute('data-status', 'active');
    expect(await projectName(page)).toBe(TUTORIAL_NAME);
  });

  test('an unfinished Choreo restarts at the Choreo step after reload', async ({ page }) => {
    await startFromWelcomeTip(page);
    await page.locator('#timeline [data-tl="choreo"]').click();
    await moveSeven(page);
    await page.reload({ waitUntil: 'load' });
    await expect(step(page, 'choreo')).toHaveAttribute('data-status', 'active');
  });

  test('skip returns to the original project', async ({ page }) => {
    const before = await startFromWelcomeTip(page);
    await page.locator('#tutorialCard [data-x="skip"]').click();
    await expect(page.locator('#tutorialCard')).toBeHidden();
    await tick(page);
    const after = await snapshotCurrent(page);
    expect(after.id).toBe(before.id);
    expect(after.frames).toBe(before.frames);
  });

  test('Help overlay starts the tutorial too, and restarting reuses one tutorial project', async ({ page }) => {
    await boot(page);
    await page.locator('#onboardingTip button', { hasText: 'Got it' }).click();
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('?');
      await page.locator('#helpOverlay [data-x="tutorial"]').click();
      await expect(page.locator('#helpOverlay')).toBeHidden();
      await expect(step(page, 'choreo')).toHaveAttribute('data-status', 'active');
    }
    const count = await page.evaluate(async () =>
      (await import('/src/authoring/storage.js')).listProjects().filter((p) => p.name === 'Tutorial: first choreo').length);
    expect(count).toBe(1);
  });

  for (const [name, open] of [
    ['topbar button', async (page) => page.locator('#appTopbar [data-action="tutorial"]').click()],
    ['timeline button', async (page) => page.locator('#timeline [data-action="tutorial"]').click()],
    ['Library dialog', async (page) => {
      await page.locator('#appRail [data-action="library"]').click();
      await page.locator('dialog.library-dialog [data-action="tutorial"]').click();
      await expect(page.locator('dialog.library-dialog')).toHaveCount(0);
    }],
  ]) {
    test(`starts from the ${name} after the welcome tip is gone`, async ({ page }) => {
      await boot(page);
      await page.locator('#onboardingTip button', { hasText: 'Got it' }).click();
      await open(page);
      await expect(step(page, 'choreo')).toHaveAttribute('data-status', 'active');
      expect(await projectName(page)).toBe(TUTORIAL_NAME);
    });
  }

  test('stalling on a DOM step pulses its target', async ({ page }) => {
    await startFromWelcomeTip(page);
    // Shift the page clock so the app's own 1 s interval sees the stall too (else it clears the cue).
    await page.evaluate(async () => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + 60000;
      (await import('/src/authoring/choreo-tutorial-ui.js')).tutorialStallCheck();
    });
    await expect(page.locator('#timeline [data-tl="choreo"]')).toHaveClass(/tutorial-pulse/);
    await page.locator('#timeline [data-tl="choreo"]').click();
    await expect(page.locator('#timeline [data-tl="choreo"]')).not.toHaveClass(/tutorial-pulse/);
  });

  test('stalling on the release step pulses the Release slider', async ({ page }) => {
    await startFromWelcomeTip(page);
    await page.locator('#timeline [data-tl="choreo"]').click();
    await moveSeven(page);
    await passToNine(page);
    await expect(step(page, 'release')).toHaveAttribute('data-status', 'active');
    await page.evaluate(async () => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + 60000;
      (await import('/src/authoring/choreo-tutorial-ui.js')).tutorialStallCheck();
    });
    await expect(page.locator('#passReleaseSlider')).toHaveClass(/tutorial-pulse/);
  });
});
