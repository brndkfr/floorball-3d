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
  await expect(rows.nth(0).locator('.library-modified')).toHaveText(/^Lesson 1 · 8 frames/);
  await expect(rows.nth(3).locator('.library-modified')).toHaveText(/^Lesson 4 · /);
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

// A long caption must not run under the KATA card (bottom left): at 1440x900
// on lesson 4, frame 2, the first letters were clipped by the card.
test('a long lesson caption stays clear of the KATA card at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await openLesson(page, 'behind');
  await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(1));
  const caption = page.locator('#frameCaption');
  await expect(caption).toBeVisible();
  await expect(caption).toContainText('Behind the goal: play the line');
  const card = page.locator('#trainPanel .kata');
  await expect(card).toBeVisible();
  const c = await caption.boundingBox();
  const k = await card.boundingBox();
  const apart = c.x >= k.x + k.width || c.x + c.width <= k.x || c.y >= k.y + k.height || c.y + c.height <= k.y;
  expect(apart, `caption ${JSON.stringify(c)} overlaps card ${JSON.stringify(k)}`).toBe(true);
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(1440);
});

// A lesson shot ends in a save: at the shot frame the ball rests just in
// front of the goalie, not in the net behind the goal line.
test('lesson 3: at the shot frame the ball rests in front of the goalie, not in the goal', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'passOrShot');
  const at = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    (await import('/src/authoring/frames.js')).selectFrame(3);
    const { GOAL_Z } = await import('/src/authoring/ball-pose.js');
    const b = state.ballGroup.position, g = state.goalies.A.position;
    return { ball: { x: b.x, z: b.z }, goalie: { x: g.x, z: g.z }, line: GOAL_Z.A, saved: state.doc.frames[3].scheme.balls.main.shot.saved };
  });
  expect(at.saved).toBe(true);
  expect(at.ball.z).toBeGreaterThan(at.line + 500);
  expect(Math.hypot(at.ball.x - at.goalie.x, at.ball.z - at.goalie.z)).toBeLessThan(700);
});

// A-BACK-049: quiet screen. A lesson frame with `layers` shows only its
// caption, the KATA card and the named layers; the other lessons are untouched.
async function quietAt(page, frame) {
  return page.evaluate(async (frame) => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    const { scene } = await import('/src/scene.js');
    (await import('/src/authoring/frames.js')).selectFrame(frame);
    (await import('/src/authoring/lesson-quiet.js')).updateQuiet();
    await (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
    (await import('/src/goalie-zone-labels.js')).placeZoneLabels();
    (await import('/src/trajectory.js')).updateTrajectory(getBallWorldCenter());
    (await import('/src/coverage.js')).updateCoverage(getBallWorldCenter());
    const shown = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    return {
      quiet: state.quiet,
      corner: scene.getObjectByName('cornerLines')?.visible,
      shot: scene.getObjectByName('shootingLine')?.visible,
      inset: shown('#shooterInset'),
      zoneCard: shown('#trainPanel .gz'),
      labels: shown('#zoneLabels'),
      kata: shown('#trainPanel .kata'),
      caption: document.getElementById('frameCaption').textContent,
    };
  }, frame);
}

test('quiet screen: the shooting line frame shows the line, the KATA card and the caption, nothing else', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const q = await quietAt(page, 2);
  expect(q.quiet).toEqual({ shotLine: true, lines: false, coverage: false, zones: false, marks: false });
  expect(q.shot).toBe(true);
  expect(q.corner).toBe(false);
  expect(q.inset).toBe(false);
  expect(q.zoneCard).toBe(false);
  expect(q.labels).toBe(false);
  expect(q.kata).toBe(true);
  expect(q.caption).toContain('Shooting line: from the ball');
});

test('quiet screen: the shooting area frame shows the corner lines instead of the shooting line', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const q = await quietAt(page, 5);
  expect(q.quiet.lines).toBe(true);
  expect(q.corner).toBe(true);
  expect(q.shot).toBe(false);
  expect(q.caption).toContain('Shooting area');
});

test('quiet screen: the opening frame shows the caption only', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const q = await quietAt(page, 0);
  expect(q.quiet).toEqual({ shotLine: false, lines: false, coverage: false, zones: false, marks: false });
  expect(q.corner).toBe(false);
  expect(q.shot).toBe(false);
  expect(q.kata).toBe(true);
});

test('quiet screen: lessons without layers keep the full Train screen', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'zones');
  const q = await quietAt(page, 1);
  expect(q.quiet).toBeNull();
  expect(q.corner).toBe(true);
  expect(q.shot).toBe(true);
  expect(q.zoneCard).toBe(true);
  expect(q.inset).toBe(true);
  // and a quiet frame of lesson 1 gives the screen back when the lesson changes
  await openLesson(page, 'line');
  expect((await quietAt(page, 0)).quiet).not.toBeNull();
  await openLesson(page, 'zones');
  expect((await quietAt(page, 0)).quiet).toBeNull();
});

// A-BACK-049: title card and recap card. Opening lesson 1 shows its task
// until the first play; the end of a play shows the recap with Play again.
test('lesson cards: lesson 1 opens with its task card, Start plays and puts it away', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const card = page.locator('#lessonCard');
  await expect(card).toBeVisible();
  await expect(card.locator('.lc-title')).toHaveText('Shooting line and area');
  await expect(card.locator('.lc-text')).toHaveText('Watch the goalie: where does it stand, and why?');
  await expect(card.locator('.lc-bullets')).toBeHidden();
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(card).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().playing)).toBe(true);
});

test('lesson cards: the task card is German in German, and Close puts it away without playing', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => (await import('/src/lang-state.js')).setLang('de'));
  await openLesson(page, 'line');
  const card = page.locator('#lessonCard');
  await expect(card.locator('.lc-text')).toHaveText('Schau auf den Goalie: wo steht er, und warum?');
  await card.getByRole('button', { name: 'Schliessen' }).click();
  await expect(card).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().playing)).toBe(false);
});

test('lesson cards: any play dismisses the task card; the end of the play shows the three recap bullets, Play again restarts', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const card = page.locator('#lessonCard');
  await expect(card).toBeVisible();
  await page.evaluate(async () => (await import('/src/authoring/playback.js')).play());   // the transport's play
  await expect(card).toBeHidden();
  // run to the end (rAF is paused here, so the play is stepped by hand): the end pauses it and the recap shows
  await page.evaluate(async () => {
    const pb = await import('/src/authoring/playback.js');
    pb.tickPlayback(1e9);
  });
  await expect(card).toBeVisible();
  await expect(card.locator('.lc-title')).toHaveText('What to take away');
  await expect(card.locator('.lc-bullets li')).toHaveCount(3);
  await expect(card.locator('.lc-bullets li').first()).toContainText('Placement');
  await card.getByRole('button', { name: 'Play again' }).click();
  await expect(card).toBeHidden();
  const pb = await page.evaluate(async () => { const s = (await import('/src/authoring/playback.js')).playbackState(); return { playing: s.playing, elapsed: s.elapsed }; });
  expect(pb.playing).toBe(true);
  expect(pb.elapsed).toBeLessThan(1000);
});

test('lesson cards: the other lessons have no card', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'zones');
  await expect(page.locator('#lessonCard')).toBeHidden();
  await page.evaluate(async () => {
    const pb = await import('/src/authoring/playback.js');
    pb.play();
    pb.tickPlayback(1e9);
  });
  await expect(page.locator('#lessonCard')).toBeHidden();
});
