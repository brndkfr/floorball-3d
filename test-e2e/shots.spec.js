// A-BACK-022: shots at goal - Inspector buttons, right-click on a goal, aim pad, verdict, 3D flight.

import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  const tip = page.locator('#onboardingTip button', { hasText: 'Got it' });
  if (await tip.count()) await tip.first().click();
  await page.waitForFunction(async () => { const { state } = await import('/src/state.js'); return !!state.ballGroup && !!state.goalieGroup && state.goalInstances?.length >= 2; });
}

async function tick(page) {
  await page.evaluate(async () => {
    (await import('/src/authoring/actors.js')).tickActors();
    (await import('/src/authoring/pass-overlay.js')).tickPassOverlay();
  });
}

// #9 (team 1) carries the ball at (x, z); the default goalie stands at goal A.
async function setupShooter(page, { x = 0, z = 12000 } = {}) {
  const id = await page.evaluate(async ({ x, z }) => {
    const { ensureDoc } = await import('/src/authoring/doc.js');
    const { spawnChip } = await import('/src/authoring/chips.js');
    const { setBallCarrier } = await import('/src/authoring/actors.js');
    const { enterTopDown, isTopDown, resetTopDownView } = await import('/src/authoring/topdown-camera.js');
    ensureDoc().scheme.players = {};
    const id = spawnChip({ team: 1, x, z, number: 9, pushHistory: false });
    setBallCarrier(id);
    if (!isTopDown()) enterTopDown();
    resetTopDownView();
    return id;
  }, { x, z });
  await page.waitForFunction(async () => (await import('/src/state.js')).state.chipGroups.length === 1);
  await tick(page);
  return id;
}

const selectChip = (page, id) => page.evaluate(async (id) => {
  const { selectObject } = await import('/src/selection.js');
  const { state } = await import('/src/state.js');
  selectObject(state.chipGroups.find((g) => g.userData.chip?.id === id));
}, id);

const docState = (page) => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  return { frames: state.doc.frames.length, current: state.doc.currentFrame, ball: state.doc.scheme.balls.main };
});

async function screenOf(page, x, y, z) {
  return page.evaluate(async ([x, y, z]) => {
    const THREE = await import('three');
    const { renderer } = await import('/src/scene.js');
    const { state } = await import('/src/state.js');
    const v = new THREE.Vector3(x, y, z).project(state.activeCamera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top };
  }, [x, y, z]);
}

test.describe('A-BACK-022 shots at goal', () => {
  test('"Shoot at B" adds a frame with the ball in goal B, and playback flies it in at height', async ({ page }) => {
    await boot(page);
    const id = await setupShooter(page, { x: 0, z: 26000 });   // 10 m out: 0.4 s at 25 m/s fits after a 50% release
    await selectChip(page, id);
    await page.locator('#inspectorShoot [data-shoot="B"]').click();
    const s = await docState(page);
    expect(s.frames).toBe(2);
    expect(s.current).toBe(1);
    expect(s.ball.carrier).toBeNull();
    expect(s.ball.shot).toEqual({ goal: 'B', aimX: 0, aimY: 575 });
    expect(s.ball.z).toBeGreaterThan(36500);

    const poses = await page.evaluate(async () => {
      const { seekTo, stop, play } = await import('/src/authoring/playback.js');
      const { passPlan } = await import('/src/authoring/ball-pose.js');
      const { state } = await import('/src/state.js');
      const f = state.doc.frames;
      const plan = passPlan(f[0].scheme, f[1].scheme, f[0].duration);
      play();
      const at = (ms) => { seekTo(ms); const p = state.ballGroup.position; return { x: p.x, y: p.y, z: p.z }; };
      const out = { early: at(200), line: at(plan.arriveT * f[0].duration), end: at(1000) };
      stop();
      out.afterStopY = state.ballGroup.position.y;
      return out;
    });
    expect(Math.round(poses.early.z)).toBe(26250);
    expect(poses.early.y).toBe(0);
    expect(Math.round(poses.line.z)).toBe(36500);
    expect(poses.line.y).toBeGreaterThan(400);
    expect(poses.end.z).toBeGreaterThan(36500);
    expect(poses.end.y).toBe(0);
    expect(poses.afterStopY).toBe(0);
  });

  test('right-click on goal A with the ball selected shoots at A', async ({ page }) => {
    await boot(page);
    await setupShooter(page);
    await page.evaluate(async () => {
      const { selectObject } = await import('/src/selection.js');
      selectObject((await import('/src/state.js')).state.ballGroup);
    });
    const p = await screenOf(page, 500, 300, 3500);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await expect.poll(async () => (await docState(page)).ball.shot?.goal ?? null).toBe('A');
    expect((await docState(page)).frames).toBe(2);
  });

  test('in Choreo without a pass the shot goes into the draft frame', async ({ page }) => {
    await boot(page);
    const id = await setupShooter(page);
    await page.locator('#timeline [data-tl="choreo"]').click();
    await selectChip(page, id);
    await page.locator('#inspectorShoot [data-shoot="B"]').click();
    const s = await docState(page);
    expect(s.frames).toBe(2);
    expect(s.ball.shot?.goal).toBe('B');
    expect(await page.locator('#choreoBanner').isVisible()).toBe(true);
  });

  test('aim pad: dragging the dot and arrow keys move the aim point', async ({ page }) => {
    await boot(page);
    const id = await setupShooter(page);
    await selectChip(page, id);
    await page.locator('#inspectorShoot [data-shoot="B"]').click();
    await page.evaluate(async () => {
      const { selectObject } = await import('/src/selection.js');
      selectObject((await import('/src/state.js')).state.ballGroup);
    });
    const pad = page.locator('#shotAimPad');
    const box = await pad.boundingBox();
    const dot = await page.locator('#shotAimDot').boundingBox();
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1, { steps: 6 });
    await page.mouse.up();
    let shot = (await docState(page)).ball.shot;
    expect(shot.aimX).toBeLessThan(-500);     // shooter's right at goal B is -x
    expect(shot.aimY).toBeGreaterThan(900);   // top corner
    await pad.focus();
    await page.keyboard.press('ArrowDown');
    const lowered = (await docState(page)).ball.shot.aimY;
    expect(lowered).toBeLessThan(shot.aimY);
  });

  test('verdict: goalie squared up at goal A, open shot at goal B', async ({ page }) => {
    await boot(page);
    const id = await setupShooter(page, { x: 0, z: 12000 });
    await selectChip(page, id);
    await page.locator('#inspectorShoot [data-shoot="A"]').click();
    await page.evaluate(async () => {
      const { selectObject } = await import('/src/selection.js');
      selectObject((await import('/src/state.js')).state.ballGroup);
    });
    await expect(page.locator('#shotStatus')).toHaveText('Goalie squared up');

    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    await selectChip(page, id);
    await page.locator('#inspectorShoot [data-shoot="B"]').click();
    await page.evaluate(async () => {
      const { selectObject } = await import('/src/selection.js');
      selectObject((await import('/src/state.js')).state.ballGroup);
    });
    await expect(page.locator('#shotStatus')).toHaveText('Open shot');
  });
});
