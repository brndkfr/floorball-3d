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

test('lesson 1: on the "What went wrong?" frame the live KATA card reads placement off, not the ball in the net', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const r = await page.evaluate(async () => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    const { seekTo } = await import('/src/authoring/playback.js');
    const { updateGoalieZones } = await import('/src/goalie-zones-layer.js');
    const { updateKataReadout } = await import('/src/kata-readout.js');
    const at = (ms) => { seekTo(ms); updateGoalieZones(getBallWorldCenter()); updateKataReadout(); return state.kataReadout?.judged?.status?.placement; };
    const [f0, f1] = state.doc.frames;
    const mid = at(f0.duration + f1.duration / 2);   // the caption is still up: the goalie still off the line
    const placement = at(f0.duration);   // the goal keyframe: the ball is in the net
    return { mid, placement, ballZ: getBallWorldCenter().z, gradedZ: state.kataReadout?.inputs?.ball?.z };
  });
  expect(r.placement).toBe('adjust');
  expect(r.mid).toBe('adjust');
  expect(r.gradedZ).toBeGreaterThan(r.ballZ + 3000);   // graded from the release point out on the rink
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

// A-BACK-049: director camera. A lesson whose frames name shots (`cam`)
// steers the 3D camera from the play time; the Director switch sits next to
// Hold and Follow; the viewer taking the camera turns it off and the pill gives
// it back. rAF is paused here, so the camera is read after seekTo().
const camNow = (page) => page.evaluate(async () => {
  const { camera } = await import('/src/scene.js');
  const { state } = await import('/src/state.js');
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z, director: state.director };
});
const seek = (page, ms) => page.evaluate(async (ms) => (await import('/src/authoring/playback.js')).seekTo(ms), ms);
const frameStart = (page, i) => page.evaluate(async (i) => {
  const { state } = await import('/src/state.js');
  return state.doc.frames.slice(0, i).reduce((s, f) => s + f.duration, 0);
}, i);
const directorPose = (page, ms) => page.evaluate(async (ms) => (await import('/src/authoring/playback.js')).directorPoseFor(ms), ms);

test('director: lesson 1 has the Director switch, on, and the camera follows the shot of the play time', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await expect(page.locator('#directorPill')).toBeHidden();
  expect((await camNow(page)).director).toBe(true);
  // frame 4 of the lesson (index 3) is the side knee shot: a level camera at knee height
  await seek(page, await frameStart(page, 3) + 2000);
  const side = await camNow(page);
  expect(side.y).toBeGreaterThan(300);
  expect(side.y).toBeLessThan(600);
  // the opening shot: shooter eyes, head height behind the ball
  await seek(page, 100);
  const eyes = await camNow(page);
  expect(eyes.y).toBeGreaterThan(1200);
  expect(eyes.y).toBeLessThan(1700);
  const want = await directorPose(page, 100);
  for (const k of ['x', 'y', 'z']) expect(eyes[k]).toBeCloseTo(want[k], 0);
});

test('director: slow motion, the flight of the first shot takes longer than a default-speed shot would', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const r = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { passPlan, DEFAULT_SHOT_SPEED_MPS } = await import('/src/authoring/ball-pose.js');
    const f = state.doc.frames;
    const plan = passPlan(f[0].scheme, f[1].scheme, f[0].duration);
    const dist = Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z);
    return { needMs: plan.needMs, defaultMs: dist / DEFAULT_SHOT_SPEED_MPS };
  });
  expect(r.needMs).toBeGreaterThan(r.defaultMs * 3);
});

test('director: the viewer zooming turns it off and shows the pill; the pill gives the camera back', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await seek(page, 100);
  const start = await camNow(page);
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -300);
  const pill = page.locator('#directorPill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText('Free camera - Back to director');
  await expect(page.locator('#timeline [data-tl="director"]')).toHaveAttribute('aria-pressed', 'false');   // hidden in Train, still in step
  const zoomed = await camNow(page);
  expect(zoomed.director).toBe(false);
  expect(Math.hypot(zoomed.x - start.x, zoomed.y - start.y, zoomed.z - start.z)).toBeGreaterThan(50);
  // no automatic snap back: stepping the play leaves the camera of the viewer alone
  await seek(page, await frameStart(page, 3) + 2000);
  const kept = await camNow(page);
  expect(Math.hypot(kept.x - zoomed.x, kept.y - zoomed.y, kept.z - zoomed.z)).toBeLessThan(1);
  await pill.click();
  await expect(pill).toBeHidden();
  const back = await camNow(page);
  expect(back.director).toBe(true);
  const want = await directorPose(page, await page.evaluate(async () => (await import('/src/authoring/playback.js')).playheadMs()));
  for (const k of ['x', 'y', 'z']) expect(back[k]).toBeCloseTo(want[k], 0);
});

test('director: an orbit drag on the 3D view also turns it off', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await seek(page, 100);
  await page.mouse.move(720, 120);
  await page.mouse.down();
  await page.mouse.move(780, 150, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#directorPill')).toBeVisible();
  expect((await camNow(page)).director).toBe(false);
});

test('director: the Director switch sits in the recorder next to Hold and Follow and turns it off and on', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await page.locator('#trainOpenAsPlay').click();   // the lesson as a play in Plan, where the recorder is
  await expect(page.locator('#appRail [data-mode="plan"]')).toHaveClass(/active/);
  const btn = page.locator('#timeline [data-tl="director"]');
  await expect(btn).toBeVisible();
  await expect(page.locator('#timeline [data-tl="hold"]')).toBeVisible();
  await expect(page.locator('#timeline [data-tl="follow"]')).toBeVisible();
  await expect(btn).toHaveText('Director');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#directorPill')).toBeVisible();
  expect((await camNow(page)).director).toBe(false);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#directorPill')).toBeHidden();
});

test('director: the camera menu (Plan) lists the shots, off without a lesson, and a pick takes the camera', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const menuButton = page.locator('#appTopbar [data-action="camera-presets"]');
  await menuButton.click();
  const shots = page.locator('#cameraPresetMenu [data-shot]');
  await expect(shots).toHaveCount(6);
  await expect(shots.nth(3)).toHaveText('Side, knee height');
  await expect(shots.nth(3)).toBeDisabled();   // a plain play has no goalie to look at
  await page.keyboard.press('Escape');
  await openLesson(page, 'line');
  await page.locator('#trainOpenAsPlay').click();   // the lesson as a play in Plan, where the menu is
  await menuButton.click();
  await expect(shots.nth(3)).toBeEnabled();
  await shots.nth(3).click();
  await expect(page.locator('#directorPill')).toBeVisible();
  const c = await camNow(page);
  expect(c.director).toBe(false);
  expect(c.y).toBeGreaterThan(300);
  expect(c.y).toBeLessThan(600);
});

test('director: a restart and a new lesson bring it back; lessons without shots have no switch', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await page.evaluate(async () => (await import('/src/authoring/director-state.js')).setDirector(false));
  expect((await camNow(page)).director).toBe(false);
  await page.evaluate(async () => {
    const pb = await import('/src/authoring/playback.js');
    pb.play();
    pb.tickPlayback(1e9);   // to the end, paused there
    pb.play();              // a play at the end rewinds: a restart
  });
  expect((await camNow(page)).director).toBe(true);
  await page.evaluate(async () => (await import('/src/authoring/director-state.js')).setDirector(false));
  await openLesson(page, 'line');   // a new lesson
  expect((await camNow(page)).director).toBe(true);
  await openLesson(page, 'zones');
  expect(await page.evaluate(() => document.querySelector('#timeline [data-tl="director"]').hidden)).toBe(true);   // no shots: no switch
});

test('director: Stop brings it back and shows the opening shot', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await page.evaluate(async () => {
    const pb = await import('/src/authoring/playback.js');
    pb.play();
    pb.tickPlayback(2000);
    (await import('/src/authoring/director-state.js')).setDirector(false);   // the viewer took the camera mid-play
    pb.stop();
  });
  const c = await camNow(page);
  expect(c.director).toBe(true);
  await expect(page.locator('#directorPill')).toBeHidden();
  const want = await directorPose(page, 0);
  for (const k of ['x', 'y', 'z']) expect(c[k]).toBeCloseTo(want[k], 0);
});

test('director: the video export always uses the director, whatever the switch says', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLesson(page, 'line');
  await page.evaluate(async () => (await import('/src/authoring/director-state.js')).setDirector(false));
  const r = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { camera } = await import('/src/scene.js');
    const pb = await import('/src/authoring/playback.js');
    const at = pb.directorPoseFor(100);
    camera.position.set(1, 2, 3);
    pb.seekTo(100);
    const free = { x: camera.position.x, y: camera.position.y, z: camera.position.z };   // switch off: untouched
    state.directorForced = true;   // what export.js sets while it renders
    pb.seekTo(100);
    const forced = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    state.directorForced = false;
    return { at, free, forced };
  });
  expect(r.free).toEqual({ x: 1, y: 2, z: 3 });
  for (const k of ['x', 'y', 'z']) expect(r.forced[k]).toBeCloseTo(r.at[k], 0);
});

// A-BACK-049, decided 2026-11-22: Train has its own small transport while a
// lesson is open (the recorder is Plan only): Play/Pause, Restart and the
// Director switch, under the stage with the caption above it.
const playing = (page) => page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().playing);

test('lesson transport: shown in Train for a lesson only; Play/Pause, Restart and Director work', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const bar = page.locator('#lessonTransport');
  await page.locator('#appRail button[data-mode="train"]').click();
  await expect(bar).toBeHidden();   // the practice rink, no lesson
  await openLesson(page, 'line');
  await page.locator('#lessonCard .lc-close').click();
  await expect(bar).toBeVisible();
  const play = bar.getByRole('button', { name: 'Play' });
  await play.click();
  expect(await playing(page)).toBe(true);
  await bar.getByRole('button', { name: 'Pause' }).click();
  expect(await playing(page)).toBe(false);

  const dir = bar.getByRole('button', { name: 'Director' });
  await expect(dir).toHaveAttribute('aria-pressed', 'true');
  await dir.click();
  await expect(dir).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#directorPill')).toBeVisible();

  await page.evaluate(async () => (await import('/src/authoring/playback.js')).seekTo(6000));
  await bar.getByRole('button', { name: 'Restart' }).click();
  expect(await playing(page)).toBe(true);
  expect(await page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().elapsed)).toBeLessThan(500);
  await expect(dir).toHaveAttribute('aria-pressed', 'true');   // a restart brings the director back

  // the caption sits above the bar, not under it
  const cap = await page.locator('#frameCaption').boundingBox();
  const b = await bar.boundingBox();
  if (cap) expect(cap.y + cap.height).toBeLessThanOrEqual(b.y + 1);
});

test('lesson transport: German labels; a lesson without shots has no Director button; Plan hides the bar', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'zones');
  const bar = page.locator('#lessonTransport');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-lt="director"]')).toBeHidden();
  await page.evaluate(async () => (await import('/src/lang-state.js')).setLang('de'));
  await expect(bar.locator('[data-lt="play"]')).toHaveAccessibleName('Abspielen');
  await expect(bar.locator('[data-lt="restart"]')).toHaveAccessibleName('Neu starten');
  await page.locator('#appRail button[data-mode="plan"]').click();
  await expect(bar).toBeHidden();
});

// Lesson 1 review 2026-11-22: the video export holds on captions, runs
// through the last caption and carries the title and recap cards (export-plan.js).
test('export plan: a lesson holds and carries its cards; a fresh own play is the plain sweep', async ({ page }) => {
  await boot(page);
  const own = await page.evaluate(async () => {
    const ex = await import('/src/authoring/export.js');
    const end = ex.totalDurationMs();
    const plan = end > 0 ? ex.planFor(30, 0, end) : [];
    return { n: plan.length, cards: plan.filter((p) => p.card).length, want: Math.max(1, Math.floor(end * 30 / 1000)), end };
  });
  if (own.end > 0) { expect(own.cards).toBe(0); expect(own.n).toBe(own.want); }
  await openLesson(page, 'line');
  const r = await page.evaluate(async () => {
    const ex = await import('/src/authoring/export.js');
    const end = ex.totalDurationMs();
    const plan = ex.planFor(30, 0, end);
    return { n: plan.length, plain: Math.floor(end * 30 / 1000), first: plan[0].card, last: plan.at(-1).card, end, lastPlay: plan.filter((p) => !p.card).at(-1).playMs };
  });
  expect(r.first).toBe('intro');
  expect(r.last).toBe('recap');
  expect(r.n).toBeGreaterThan(r.plain * 2);   // holds and cards: well over twice the plain sweep
  expect(r.lastPlay).toBe(r.end);
});

test('lesson shot: a fading ball trail shows in flight, not before the release nor in the build-up', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const dots = () => page.evaluate(async () => {
    const { scene } = await import('/src/scene.js');
    const g = scene.getObjectByName('ballTrail');
    return g ? g.children.filter((m) => m.visible).length : -1;
  });
  await seek(page, 100);
  expect(await dots()).toBe(0);
  await seek(page, 1500);
  expect(await dots()).toBeGreaterThanOrEqual(3);
  await seek(page, await frameStart(page, 2) + 500);
  expect(await dots()).toBe(0);
});

test('lesson export: the KATA readout the video box draws is judged for placement, depth and axis', async ({ page }) => {
  await boot(page);
  await openLesson(page, 'line');
  const info = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { seekTo } = await import('/src/authoring/playback.js');
    const { updateKataReadout } = await import('/src/kata-readout.js');
    seekTo(9000);
    updateKataReadout();
    return state.kataReadout?.judged?.status ?? null;
  });
  expect(info && ['placement', 'depth', 'axis'].every((d) => d in info)).toBe(true);
});
