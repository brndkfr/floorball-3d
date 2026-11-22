// S-BACK-033: the command layer in the real app. Each command runs through
// runCommand() and has the same effect as the UI path it wraps; errors come
// back as { ok: false }, never as a page error. seekTo-based commands avoid
// rAF, which is unreliable in Playwright tabs.

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

const run = (page, name, input) => page.evaluate(async ([name, input]) => {
  const { commands } = await import('/src/commands/registry.js');
  return commands.runCommand(name, input);
}, [name, input]);

test('listCommands offers the first slice with input schemas', async ({ page }) => {
  await boot(page);
  const list = await page.evaluate(async () => (await import('/src/commands/registry.js')).commands.listCommands());
  const names = list.map((c) => c.name);
  for (const n of ['lesson.open', 'goalie.place', 'playback.seek', 'playback.stop', 'kata.read', 'screenshot.take']) expect(names).toContain(n);
  for (const c of list) {
    expect(c.description.length).toBeGreaterThan(10);
    expect(c.input.type).toBe('object');
  }
  const place = list.find((c) => c.name === 'goalie.place');
  expect(place.description).toMatch(/millimetres/);
  expect(place.description).toMatch(/goal A/);
  expect(JSON.parse(JSON.stringify(list))).toEqual(list);   // valid JSON schemas for MCP
});

test('lesson.open shows the lesson in Train; an unknown key is an error', async ({ page }) => {
  await boot(page);
  const r = await run(page, 'lesson.open', { key: 'zones' });
  expect(r.ok).toBe(true);
  expect(r.result.frames).toBeGreaterThan(2);
  expect(await page.evaluate(() => document.body.dataset.mode)).toBe('train');
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.doc.autoGoalie)).toBeTruthy();
  const bad = await run(page, 'lesson.open', { key: 'nope' });
  expect(bad.ok).toBe(false);
  expect(bad.error).toMatch(/nope/);
});

test('goalie.place moves the goalie and stores it in the current frame', async ({ page }) => {
  await boot(page);
  await run(page, 'lesson.open', { key: 'zones' });
  const r = await run(page, 'goalie.place', { goal: 'A', x: -2500, z: 5200, angle: 0.3 });
  expect(r.ok).toBe(true);
  const g = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const doc = state.doc;
    return { mesh: { x: state.goalies.A.position.x, z: state.goalies.A.position.z, a: state.goalies.A.rotation.y }, stored: doc.frames[doc.currentFrame].scheme.goalies.A };
  });
  expect(g.mesh).toEqual({ x: -2500, z: 5200, a: 0.3 });
  expect(g.stored).toEqual({ x: -2500, z: 5200, angle: 0.3 });
  const bad = await run(page, 'goalie.place', { goal: 'C', x: 0, z: 0 });
  expect(bad.ok).toBe(false);
  // off the rink (the old test value, 17 m across a 20 m wide rink): rejected, goalie stays put
  const off = await run(page, 'goalie.place', { goal: 'A', x: -17000, z: 600 });
  expect(off.ok).toBe(false);
  expect(off.error).toMatch(/off the rink/);
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.goalies.A.position.x)).toBe(-2500);
});

test('playback.seek poses the play at a time; playback.stop goes back to the edit frame', async ({ page }) => {
  await boot(page);
  await run(page, 'lesson.open', { key: 'zones' });
  const r = await run(page, 'playback.seek', { ms: 1500 });
  expect(r.ok).toBe(true);
  expect(r.result.elapsed).toBe(1500);
  expect(r.result.total).toBeGreaterThan(1500);
  expect(await page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().previewing)).toBe(true);
  expect((await run(page, 'playback.stop', {})).ok).toBe(true);
  const pb = await page.evaluate(async () => {
    const s = (await import('/src/authoring/playback.js')).playbackState();
    return { elapsed: s.elapsed, previewing: s.previewing };
  });
  expect(pb).toEqual({ elapsed: 0, previewing: false });
});

test('kata.read returns the readout as plain data in Train, an error outside it', async ({ page }) => {
  await boot(page);
  const outside = await run(page, 'kata.read', {});
  expect(outside.ok).toBe(false);
  expect(outside.error).toMatch(/Train/);
  await run(page, 'lesson.open', { key: 'zones' });
  const r = await run(page, 'kata.read', {});
  expect(r.ok).toBe(true);
  expect(['A', 'B']).toContain(r.result.goal);
  expect(typeof r.result.zone).toBe('string');
  expect(typeof r.result.action).toBe('string');
  expect(typeof r.result.kata.depthMm).toBe('number');
  expect(r.result.judged).toBeTruthy();
  expect(JSON.parse(JSON.stringify(r.result))).toEqual(r.result);   // survives JSON (MCP)
});

test('screenshot.take returns a PNG data URL of the stage size', async ({ page }) => {
  await boot(page);
  const r = await run(page, 'screenshot.take', { clean: true });
  expect(r.ok).toBe(true);
  expect(r.result.mimeType).toBe('image/png');
  expect(r.result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  const want = await page.evaluate(async () => {
    const { captureStage } = await import('/src/screenshot.js');
    const c = await captureStage({ clean: true });
    return { w: c.width, h: c.height };
  });
  expect({ w: r.result.width, h: r.result.height }).toEqual(want);
  const size = await page.evaluate((url) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.src = url; }), r.result.dataUrl);
  expect(size).toEqual(want);
});
