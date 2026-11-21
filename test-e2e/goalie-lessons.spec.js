// A-BACK-049: goalie lessons. openLesson() shows a shipped lesson on the
// Train practice rink with the lesson camera; during playback the lesson's
// goalie follows the rules (goalie-track.js), not a straight line between
// keyframes, and stopping puts the stored keyframe pose back.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A && !!state.goalies.B;
  });
}

const openLesson = (page, key) => page.evaluate(async (key) => {
  const { openLesson } = await import('/src/authoring/train-mode.js');
  return openLesson(key);
}, key);

test('openLesson shows the lesson in Train: its frames, its first caption', async ({ page }) => {
  await boot(page);
  expect(await openLesson(page, 'zones')).toBe(true);
  await expect(page.locator('#appRail [data-mode="train"]')).toHaveClass(/active/);
  await expect(page.locator('#trainPanel')).toBeVisible();
  const info = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { frames: state.doc.frames.length, auto: state.doc.autoGoalie, name: state.doc.meta.name };
  });
  expect(info).toEqual({ frames: 5, auto: 'A', name: 'Through the zones' });
  await expect(page.getByText('Attention zone: stay patient.', { exact: false }).first()).toBeVisible();
  expect(await openLesson(page, 'nope')).toBe(false);
});

test('the lesson camera goes high over the side board, level with goal A', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });   // no blend (rAF is paused here): the pose lands at once
  await openLesson(page, 'zones');
  const c = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { lessonPose } = await import('/src/camera-presets.js');
    const p = state.activeCamera.position;
    return { x: p.x, y: p.y, z: p.z, want: lessonPose('A') };
  });
  expect(c.x).toBeGreaterThan(10000);   // outside the side board
  expect(c.z).toBeLessThan(20000);      // over goal A's half
  for (const k of ['x', 'y', 'z']) expect(c[k]).toBeCloseTo(c.want[k], -1);
});

test('during playback the lesson goalie follows the track, not the straight line; stop restores the keyframe', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'zones');
  const r = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { seekTo, stop } = await import('/src/authoring/playback.js');
    const { goalieTrack, goalieTrackAt } = await import('/src/goalie-track.js');
    const frames = state.doc.frames;
    const t = frames[0].duration + frames[1].duration + frames[2].duration / 2;   // halfway into the move toward the corner
    seekTo(t);
    const g = state.goalies.A;
    const shown = { x: g.position.x, z: g.position.z, yaw: g.rotation.y };
    const want = goalieTrackAt(goalieTrack(frames, 'A'), t);
    const a = frames[2].scheme.goalies.A, b = frames[3].scheme.goalies.A;
    const linear = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    stop();
    const kept = frames.map((f) => f.scheme.goalies.A);
    const back = { x: g.position.x, z: g.position.z };
    return { shown, want, linear, back, edit: frames[state.doc.currentFrame].scheme.goalies.A, kept: JSON.stringify(kept) };
  });
  expect(Math.abs(r.shown.x - r.want.x)).toBeLessThan(1);
  expect(Math.abs(r.shown.z - r.want.z)).toBeLessThan(1);
  expect(Math.hypot(r.shown.x - r.linear.x, r.shown.z - r.linear.z)).toBeGreaterThan(100);
  expect(Math.abs(r.back.x - r.edit.x)).toBeLessThan(1);
  expect(Math.abs(r.back.z - r.edit.z)).toBeLessThan(1);
});

test('every keyframe of the lesson reads all ok on the live KATA card', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'zones');
  const n = await page.evaluate(async () => (await import('/src/state.js')).state.doc.frames.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(async (i) => {
      const { state } = await import('/src/state.js');
      const { seekTo } = await import('/src/authoring/playback.js');
      const { updateGoalieZones } = await import('/src/goalie-zones-layer.js');
      const { updateKataReadout } = await import('/src/kata-readout.js');
      const { getBallWorldCenter } = await import('/src/state.js');
      seekTo(state.doc.frames.slice(0, i).reduce((s, f) => s + f.duration, 0));
      updateGoalieZones(getBallWorldCenter());
      updateKataReadout();
    }, i);
    const { goal, status } = await page.evaluate(async () => {
      const r = (await import('/src/state.js')).state.kataReadout;
      return { goal: r?.goal, status: r?.judged?.status };
    });
    expect(goal, `frame ${i}: the lesson's goal is judged`).toBe('A');
    for (const dim of ['placement', 'depth', 'axis']) expect(status?.[dim], `frame ${i} ${dim}`).toMatch(/^(ok|free)$/);
  }
});

// The Lessons shelf in the Library: a row per shipped lesson, Open shows it in Train.
test('Library shelf: the lesson row opens the lesson in Train and closes the Library', async ({ page }) => {
  await boot(page);
  await page.locator('#appRail button[data-mode="library"]').click();
  const shelf = page.locator('dialog.library-dialog .library-lessons');
  await expect(shelf).toBeVisible();
  await expect(shelf.getByRole('heading', { name: 'Goalie lessons' })).toBeVisible();
  const row = shelf.locator('.library-row[data-lesson="zones"]');
  await expect(row.locator('.library-name')).toHaveText('Through the zones');
  await expect(row.locator('.library-modified')).toHaveText('Lesson 2 · 5 frames · 12 s');
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('dialog.library-dialog')).toHaveCount(0);
  await expect(page.locator('#appRail [data-mode="train"]')).toHaveClass(/active/);
  const info = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { frames: state.doc.frames.length, auto: state.doc.autoGoalie, name: state.doc.meta.name };
  });
  expect(info).toEqual({ frames: 5, auto: 'A', name: 'Through the zones' });
});

test('Library shelf: in German the shelf and the opened lesson are German', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { setLang } = await import('/src/lang-state.js');
    setLang('de');
  });
  await page.locator('#appRail button[data-mode="library"]').click();
  const shelf = page.locator('dialog.library-dialog .library-lessons');
  await expect(shelf.getByRole('heading', { name: 'Goalie-Lektionen' })).toBeVisible();
  const row = shelf.locator('.library-row[data-lesson="zones"]');
  await expect(row.locator('.library-name')).toHaveText('Durch die Zonen');
  await row.getByRole('button', { name: 'Öffnen' }).click();
  await expect(page.locator('#appRail [data-mode="train"]')).toHaveClass(/active/);
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.doc.meta.name)).toBe('Durch die Zonen');
});

// All four lessons of the module (A-BACK-049), in its order; each one opens.
test('Library shelf: the four lessons in module order, and each one opens in Train', async ({ page }) => {
  await boot(page);
  await page.locator('#appRail button[data-mode="library"]').click();
  const rows = page.locator('dialog.library-dialog .library-lessons .library-row');
  await expect(rows).toHaveCount(4);
  const keys = await rows.evaluateAll((els) => els.map((e) => e.dataset.lesson));
  expect(keys).toEqual(['line', 'zones', 'passOrShot', 'behind']);
  await expect(rows.nth(0).locator('.library-modified')).toHaveText(/^Lesson 1 · 5 frames/);
  await page.keyboard.press('Escape');
  for (const key of keys) {
    expect(await openLesson(page, key)).toBe(true);
    const info = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { auto: state.doc.autoGoalie, caption: document.getElementById('frameCaption').textContent };
    });
    expect(info.auto, key).toBe('A');
    expect(info.caption.length, key).toBeGreaterThan(0);
  }
});
