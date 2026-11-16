// A-BACK-054: Train mode in the left rail (A-Q-008 revised) with its own
// practice rink (A-Q-011). Plan's editing UI hides, the Train panel shows,
// and nothing done in Train reaches the user's play, its saved copy or its
// undo history. "Open as play" copies the situation into a new project.

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

const railBtn = (page, mode) => page.locator(`#appRail [data-mode="${mode}"]`);
const panel = (page) => page.locator('#trainPanel');
const topbar = (page) => page.locator('#appTopbar');

// The Plan play: a named project with a moved goalie, saved.
async function seedPlan(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { saveDoc, getCurrentProjectId } = await import('/src/authoring/storage.js');
    const { pushHistory } = await import('/src/authoring/history.js');
    state.goalies.A.position.set(-600, 0, 4200);
    const doc = ensureDoc();
    doc.scheme.goalies = { ...(doc.scheme.goalies || {}), A: { x: -600, z: 4200, angle: 0 } };
    doc.meta.name = 'My play';
    saveDoc();
    pushHistory();
    const id = getCurrentProjectId();
    return { id, doc: JSON.stringify(doc), saved: localStorage.getItem(`floorball-3d:project:${id}`), history: localStorage.getItem(`floorball-3d:history:${id}`) };
  });
}

test('the Train button switches to Train mode: Plan UI hidden, Train panel shown', async ({ page }) => {
  await boot(page);
  await expect(railBtn(page, 'train')).toBeVisible();
  await expect(panel(page)).toBeHidden();
  await railBtn(page, 'train').click();
  await expect(railBtn(page, 'train')).toHaveClass(/active/);
  await expect(railBtn(page, 'plan')).not.toHaveClass(/active/);
  await expect(panel(page)).toBeVisible();
  for (const id of ['toolPalette', 'timeline', 'dock', 'rightPanel']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#appTopbarProjectName')).toBeHidden();
  await expect(topbar(page).getByRole('heading', { name: 'Goalie training' })).toBeVisible();
  await expect(topbar(page).getByRole('link', { name: 'Open the module' })).toHaveAttribute('href', /goalies-positionierung/);
  // Layout A: no side panel; the overlay spans the stage, the cards float in its corners
  const stage = await panel(page).boundingBox();
  const vp = page.viewportSize();
  expect(stage.x + stage.width).toBeGreaterThanOrEqual(vp.width - 1);
  const zone = await panel(page).locator('.gz').boundingBox();
  const kata = await panel(page).locator('.kata').boundingBox();
  expect(zone.x).toBeLessThan(stage.x + 40);
  expect(zone.y).toBeLessThan(stage.y + 40);
  expect(kata.x).toBeLessThan(stage.x + 40);
  expect(kata.y + kata.height).toBeGreaterThan(stage.y + stage.height - 40);

  await railBtn(page, 'plan').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#toolPalette')).toBeVisible();
  await expect(page.locator('#appTopbarProjectName')).toBeVisible();
});

test('Train shows the practice rink; moving the goalie there never reaches the Plan play', async ({ page }) => {
  await boot(page);
  const seeded = await seedPlan(page);
  // The actor tick may autosave the seeded play once more; snapshot after it settles.
  await page.waitForTimeout(300);
  const before = await page.evaluate((id) => ({
    id,
    saved: localStorage.getItem(`floorball-3d:project:${id}`),
    history: localStorage.getItem(`floorball-3d:history:${id}`),
  }), seeded.id);
  await railBtn(page, 'train').click();

  const inTrain = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { saveDoc } = await import('/src/authoring/storage.js');
    const { pushHistory } = await import('/src/authoring/history.js');
    const doc = ensureDoc();
    const out = { name: doc.meta.name, players: Object.keys(doc.scheme.players).length, ball: { x: state.ballGroup.position.x, z: state.ballGroup.position.z } };
    state.goalies.A.position.set(2500, 0, 5000);   // the trainee moves the goalie
    doc.scheme.goalies = { A: { x: 2500, z: 5000, angle: 1 } };
    saveDoc();
    pushHistory();
    return out;
  });
  expect(inTrain.name).toBe('Goalie training');
  expect(inTrain.players).toBe(0);
  expect(inTrain.ball).toEqual({ x: 1500, z: 9500 });

  const stored = await page.evaluate((id) => ({
    saved: localStorage.getItem(`floorball-3d:project:${id}`),
    history: localStorage.getItem(`floorball-3d:history:${id}`),
    current: localStorage.getItem('floorball-3d:currentProjectId'),
  }), before.id);
  expect(stored.saved).toBe(before.saved);
  expect(stored.history).toBe(before.history);
  expect(stored.current).toBe(before.id);

  await railBtn(page, 'plan').click();
  const back = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const doc = ensureDoc();
    return { name: doc.meta.name, goalie: doc.scheme.goalies.A, mesh: { x: state.goalies.A.position.x, z: state.goalies.A.position.z } };
  });
  expect(back.name).toBe('My play');
  expect(back.goalie).toMatchObject({ x: -600, z: 4200 });
  expect(back.mesh).toEqual({ x: -600, z: 4200 });
  await expect(page.locator('#dockProjectName')).toHaveText('My play');
});

test('a reload while in Train lands in Plan with the Plan play', async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await railBtn(page, 'train').click();
  await expect(panel(page)).toBeVisible();
  await boot(page);
  await expect(railBtn(page, 'plan')).toHaveClass(/active/);
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#dockProjectName')).toHaveText('My play');
});

test('Open as play copies the practice situation into a new project and switches to Plan', async ({ page }) => {
  await boot(page);
  const before = await seedPlan(page);
  await railBtn(page, 'train').click();
  await topbar(page).getByRole('button', { name: 'Open as play' }).click();
  await expect(railBtn(page, 'plan')).toHaveClass(/active/);
  await expect(page.locator('#dockProjectName')).toHaveText('Goalie training');
  const r = await page.evaluate(async (oldId) => {
    const { getCurrentProjectId, loadProject } = await import('/src/authoring/storage.js');
    const id = getCurrentProjectId();
    return { id, ball: loadProject(id)?.frames[0].scheme.balls.main, old: loadProject(oldId)?.meta.name };
  }, before.id);
  expect(r.id).not.toBe(before.id);
  expect(r.ball).toMatchObject({ x: 1500, z: 9500 });
  expect(r.old).toBe('My play');
});

test('the Train panel follows the app language', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await page.locator('#langBtn').click();
  await page.locator('#langMenu').getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(topbar(page).getByRole('heading', { name: 'Goalie-Training' })).toBeVisible();
  await expect(topbar(page).getByRole('link', { name: 'Zum Lernmodul' })).toBeVisible();
  await expect(topbar(page).getByRole('button', { name: 'Als Spielzug öffnen' })).toBeVisible();
});

test('the side-panel toggle hides in Train; on a phone the cards sit top and bottom, clear of the tab bar', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await expect(page.locator('#appTopbar [data-action="toggle-panel"]')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const vp = page.viewportSize();
  const zone = await panel(page).locator('.gz').boundingBox();
  const kata = await panel(page).locator('.kata').boundingBox();
  const tabs = await page.locator('#appRail').boundingBox();
  for (const c of [zone, kata]) {
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(vp.width);
  }
  expect(zone.y).toBeLessThan(vp.height * 0.3);
  expect(kata.y + kata.height).toBeLessThanOrEqual(tabs.y + 1);
});

// Screen point of an object (its position lifted by `lift` mm), in CSS px.
const screenOf = (page, which, lift) => page.evaluate(async ([w, l]) => {
  const { state } = await import('/src/state.js');
  const o = w === 'ball' ? state.ballGroup : state.goalies[w];
  o.updateMatrixWorld(true);
  const v = o.position.clone();
  v.y += l;
  v.project(state.activeCamera);
  const r = document.querySelector('canvas[data-engine^="three"]').getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [which, lift]);

async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 3, from.y + dy / 3, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up();
}

const actorsNow = (page) => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  const { tickActors } = await import('/src/authoring/actors.js');
  tickActors();
  const { ensureDoc } = await import('/src/authoring/doc.js');
  const s = ensureDoc().scheme;
  const yaw = state.camYaw;
  return { goalie: { x: state.goalies.A.position.x, z: state.goalies.A.position.z }, ball: { x: state.ballGroup.position.x, z: state.ballGroup.position.z }, docGoalie: s.goalies?.A ?? null, docBall: s.balls.main, yaw };
});


test('in Train a left-drag moves the goalie and the ball in 3D; a drag on empty floor still orbits', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });            // the Train camera lands at once
  await railBtn(page, 'train').click();
  const before = await actorsNow(page);

  await drag(page, await screenOf(page, 'A', 600), 0, 60);
  const afterGoalie = await actorsNow(page);
  expect(Math.hypot(afterGoalie.goalie.x - before.goalie.x, afterGoalie.goalie.z - before.goalie.z)).toBeGreaterThan(200);
  expect(afterGoalie.docGoalie).toMatchObject({ x: afterGoalie.goalie.x, z: afterGoalie.goalie.z });
  expect(afterGoalie.yaw).toBe(before.yaw);                      // no orbit while dragging the goalie

  await drag(page, await screenOf(page, 'ball', 40), 80, 0);
  const afterBall = await actorsNow(page);
  expect(Math.hypot(afterBall.ball.x - before.ball.x, afterBall.ball.z - before.ball.z)).toBeGreaterThan(200);
  expect(afterBall.docBall).toMatchObject({ x: afterBall.ball.x, z: afterBall.ball.z });

  const r = await page.locator('canvas[data-engine^="three"]').boundingBox();
  await drag(page, { x: r.x + r.width * 0.88, y: r.y + r.height * 0.5 }, -120, 0);   // empty floor on the right, clear of the cards
  const afterOrbit = await actorsNow(page);
  expect(afterOrbit.yaw).not.toBe(afterBall.yaw);
  expect(afterOrbit.goalie).toEqual(afterBall.goalie);
});

test('in Plan a left-drag on the goalie in 3D still orbits instead of moving it', async ({ page }) => {
  await boot(page);
  await page.addStyleTag({ content: '#onboardingTip{display:none!important}' });
  const before = await actorsNow(page);
  await drag(page, await screenOf(page, 'A', 600), 0, 60);
  const after = await actorsNow(page);
  expect(after.goalie).toEqual(before.goalie);
});

test('the turn buttons turn the defending goalie 5 degrees, left and right', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  const yaw = () => page.evaluate(async () => (await import('/src/state.js')).state.goalies.A.rotation.y * 180 / Math.PI);
  await page.evaluate(async () => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    const { updateGoalieZones } = await import('/src/goalie-zones-layer.js');
    const { updateKataReadout } = await import('/src/kata-readout.js');
    updateGoalieZones(getBallWorldCenter());
    updateKataReadout();
  });
  const y0 = await yaw();
  await panel(page).getByRole('button', { name: 'Turn the goalie left' }).click();
  expect(await yaw()).toBeCloseTo(y0 + 5, 5);
  await panel(page).getByRole('button', { name: 'Turn the goalie right' }).click();
  await panel(page).getByRole('button', { name: 'Turn the goalie right' }).click();
  expect(await yaw()).toBeCloseTo(y0 - 5, 5);
});

test('the cards collapse to their header, and the choice is remembered', async ({ page }) => {
  await boot(page);
  await railBtn(page, 'train').click();
  await page.evaluate(async () => {
    const { getBallWorldCenter } = await import('/src/state.js');
    (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
    (await import('/src/kata-readout.js')).updateKataReadout();
  });
  const kataToggle = panel(page).locator('.kata').getByRole('button', { name: /KATA/ });
  await expect(kataToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).locator('.kata-rows')).toBeVisible();
  await kataToggle.click();
  await expect(kataToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page).locator('.kata-rows')).toBeHidden();
  const zoneToggle = panel(page).locator('.gz').getByRole('button', { name: /Slot/ });
  await zoneToggle.click();
  await expect(panel(page).locator('.gz-text')).toBeHidden();
  await expect(panel(page).locator('.gz-name')).toHaveText('Slot');          // the header still names the zone

  await boot(page);
  await railBtn(page, 'train').click();
  await expect(panel(page).locator('.kata').getByRole('button', { name: /KATA/ })).toHaveAttribute('aria-expanded', 'false');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('floorball3d.trainCards')))).toEqual({ zone: true, kata: true });
});

test('the hint is a pill next to the goalie on the rink', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await railBtn(page, 'train').click();
  await page.evaluate(async () => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    state.goalies.A.position.set(900, 0, 4300);
    state.goalies.A.rotation.y = 0;
    (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
    (await import('/src/shot-readout.js')).updateShotReadout();
    (await import('/src/kata-readout.js')).updateKataReadout();
    (await import('/src/authoring/kata-section.js')).placeTrainHint();
  });
  const pill = page.locator('#trainHint');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/to your right/);
  const g = await screenOf(page, 'A', 1200);
  const b = await pill.boundingBox();
  expect(Math.abs(b.x - g.x)).toBeLessThan(220);
  expect(Math.abs(b.y + b.height / 2 - g.y)).toBeLessThan(120);
});

test('Train frames the defending goal end and Plan gets its own camera back', async ({ page }) => {
  await boot(page);
  const rig = () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const c = state.activeCamera;
    return { x: c.position.x, y: c.position.y, z: c.position.z, yaw: state.camYaw };
  });
  const plan = await rig();
  await page.emulateMedia({ reducedMotion: 'reduce' });            // no blend: the pose lands at once
  await railBtn(page, 'train').click();
  const train = await rig();
  expect(train.z).toBeGreaterThan(11500);                          // in the rink, in front of goal A
  expect(train.z).toBeLessThan(20000);
  expect(train.y).toBeGreaterThan(6000);
  await railBtn(page, 'plan').click();
  const back = await rig();
  for (const k of ['x', 'y', 'z']) expect(back[k]).toBeCloseTo(plan[k], 0);
});
