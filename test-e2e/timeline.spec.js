// Timeline strip: every frame's delete button must stay reachable by a real
// user on a narrow window (e.g. VS Code's Simple Browser). Uses raw mouse
// wheel + mouse.click at hit-tested coordinates, never locator.click(),
// because Playwright auto-scrolls clipped elements into view and would hide
// exactly the bug this guards against.

import { test, expect } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

const frameCount = (page) => page.evaluate(async () => (await import('/src/state.js')).state.doc.frames.length);

async function addFrames(page, n) {
  await page.evaluate(async (n) => {
    const f = await import('/src/authoring/frames.js');
    for (let i = 0; i < n; i++) f.addFrame();
  }, n);
}

// Centre of card `i`'s "..." menu button, and whether a click there hits it.
const menuHit = (page, i) => page.evaluate((i) => {
  const btn = document.querySelectorAll('#timeline .tl-card')[i].querySelector('[data-a="menu"]');
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return { x, y, hits: document.elementFromPoint(x, y) === btn };
}, i);

test.describe('timeline strip on a narrow window', () => {
  test.use({ viewport: { width: 700, height: 700 } });

  test('each frame menu button sits inside its card', async ({ page }) => {
    await boot(page);
    await addFrames(page, 2);
    const outside = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-card')].filter((card) => {
      const c = card.getBoundingClientRect();
      const b = card.querySelector('[data-a="menu"]').getBoundingClientRect();
      return b.left < c.left || b.right > c.right;
    }).length);
    expect(outside).toBe(0);
  });

  test('wheel scrolls an overflowing strip so the last frame can be deleted', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    // Below 768 px the strip gets its own full-width row (phone layout), so
    // it takes 12 frames to overflow a 700 px window.
    const last = 11;
    await addFrames(page, last);
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    const strip = page.locator('#timeline .tl-strip');
    const overflow = await strip.evaluate((s) => s.scrollWidth - s.clientWidth);
    expect(overflow).toBeGreaterThan(10);
    expect((await menuHit(page, last)).hits).toBe(false);

    const box = await strip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 120);
    const hit = await menuHit(page, last);
    expect(hit.hits).toBe(true);

    await page.mouse.click(hit.x, hit.y);
    await page.locator('#tlFrameMenu [data-a="del"]').click();
    await expect.poll(() => frameCount(page)).toBe(last);
    expect(errors).toEqual([]);
  });

  test('re-rendering the strip keeps its scroll position', async ({ page }) => {
    await boot(page);
    await addFrames(page, 11);   // overflows 700 px even with the full-width phone strip
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    const strip = page.locator('#timeline .tl-strip');
    await strip.evaluate((s) => { s.scrollLeft = s.scrollWidth; });
    const before = await strip.evaluate((s) => s.scrollLeft);
    expect(before).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new Event('framesChanged')));
    expect(await strip.evaluate((s) => s.scrollLeft)).toBe(before);
  });

  test('selecting a clipped frame scrolls its card into view', async ({ page }) => {
    await boot(page);
    await addFrames(page, 11);   // overflows 700 px even with the full-width phone strip
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(11));
    const inView = await page.evaluate(() => {
      const s = document.querySelector('#timeline .tl-strip').getBoundingClientRect();
      const c = document.querySelector('#timeline .tl-card.editing').getBoundingClientRect();
      return c.left >= s.left - 1 && c.right <= s.right + 1;
    });
    expect(inView).toBe(true);
  });
});

// A-BACK-038 step 1: the dock status pill ("Team 1 - next #1") once sat
// at a fixed bottom offset that landed inside the timeline, on top of the
// frame card (the Broadcast port moved it to the stage's bottom-left). The timeline's height changes with the card width (wheel), so
// check both the default and the largest card size.
test.describe('dock status pill', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const overlap = (page) => page.evaluate(() => {
    const a = document.getElementById('dockStatus').getBoundingClientRect();
    const b = document.getElementById('timeline').getBoundingClientRect();
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  });

  test('does not overlap the timeline', async ({ page }) => {
    await boot(page);
    expect(await overlap(page)).toBe(0);

    const box = await page.locator('#timeline .tl-strip').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    expect(await overlap(page)).toBe(0);
  });
});

// A-BACK-038 step 2: transport controls in the current layout.
test.describe('transport controls', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const playbackSpeed = (page) => page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().speed);
  const durations = (page) => page.evaluate(async () => (await import('/src/state.js')).state.doc.frames.map((f) => f.duration));

  test('speed steps through slow motion, keys 1-4 pick one', async ({ page }) => {
    await boot(page);
    const btn = page.locator('#timeline [data-tl="speed"]');
    await expect(btn).toHaveText('1x');
    await btn.click();
    await expect(btn).toHaveText('2x');
    await btn.click();
    await expect(btn).toHaveText('0.25x');
    expect(await playbackSpeed(page)).toBe(0.25);
    await page.locator('body').press('2');
    await expect(btn).toHaveText('0.5x');
    await page.locator('body').press('9');   // no longer a speed
    expect(await playbackSpeed(page)).toBe(0.5);
  });

  test('durations are edited in seconds; the last frame has none', async ({ page }) => {
    await boot(page);
    await addFrames(page, 2);
    const inputs = page.locator('#timeline .tl-card .tl-dur');
    await expect(inputs).toHaveCount(2);
    await expect(inputs.first()).toHaveValue('1.0');
    await inputs.first().fill('1,5');
    await inputs.first().press('Enter');
    await expect.poll(() => durations(page)).toEqual([1500, 1000, 1000]);
  });

  test('scrubber seeks, and the readout follows playback time', async ({ page }) => {
    await boot(page);
    await addFrames(page, 2);   // 3 frames -> 2.0 s of animation
    const scrub = page.locator('#timeline .tl-scrub');
    const readout = page.locator('#timeline .tl-time');
    await expect(scrub).toHaveAttribute('max', '2000');
    await expect(readout).toHaveText('00:00.0 / 00:02.0');

    await scrub.fill('1500');
    await expect.poll(() => page.evaluate(async () => (await import('/src/authoring/playback.js')).playbackState().elapsed)).toBe(1500);
    await expect(readout).toHaveText('00:01.5 / 00:02.0');

    // rAF is paused in headless tabs, so drive time the way the export does.
    await page.evaluate(async () => (await import('/src/authoring/playback.js')).seekTo(500));
    await expect(readout).toHaveText('00:00.5 / 00:02.0');
    await expect(scrub).toHaveValue('500');
  });

  test('one menu per frame: delete is last and disabled on the only frame', async ({ page }) => {
    await boot(page);
    const card = page.locator('#timeline .tl-card').first();
    await expect(card.locator('button')).toHaveCount(1);
    await card.locator('[data-a="menu"]').click();
    const menu = page.locator('#tlFrameMenu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('button').last()).toHaveAttribute('data-a', 'del');
    await expect(menu.locator('[data-a="del"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // right-click a card opens the same menu; Duplicate adds a frame
    await card.click({ button: 'right' });
    await expect(menu).toBeVisible();
    await menu.locator('[data-a="dup"]').click();
    await expect(menu).toBeHidden();
    await expect.poll(() => frameCount(page)).toBe(2);
  });

  test('camera keyframe shows on the card', async ({ page }) => {
    await boot(page);
    const card = page.locator('#timeline .tl-card').first();
    await expect(card.locator('.tl-cam')).toHaveCount(0);
    await card.locator('[data-a="menu"]').click();
    await page.locator('#tlFrameMenu [data-a="cam"]').click();
    await expect(card.locator('.tl-cam')).toHaveCount(1);
    await card.locator('[data-a="menu"]').click();
    await expect(page.locator('#tlFrameMenu [data-a="cam"]')).toHaveText('Clear camera keyframe');
  });

  test('loop has its own icon and shows its state', async ({ page }) => {
    await boot(page);
    const loop = page.locator('#timeline [data-tl="loop"]');
    await expect(loop.locator('svg')).toHaveCount(1);
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'true');
  });
});

// Stepping / scrubbing while stopped poses the scene from playback time.
// tickActors() used to write that pose back into the edit frame: pressing
// "next frame" overwrote frame 0's ball with frame 1's position.
test.describe('previewing playback never edits the frame', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const twoFramesBallMoved = (page) => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const f = await import('/src/authoring/frames.js');
    const ticks = (n) => new Promise((r) => { const go = () => (n-- ? requestAnimationFrame(go) : r()); go(); });
    await ticks(3);
    f.addFrame();
    state.ballGroup.position.x += 3000;   // loose ball moves in frame 1
    await ticks(3);
    f.selectFrame(0);
    await ticks(3);
    return state.doc.frames[0].scheme.balls.main.x;
  });
  const frame0BallAfter = (page, fn) => page.evaluate(async (fn) => {
    const { state } = await import('/src/state.js');
    const pb = await import('/src/authoring/playback.js');
    const ticks = (n) => new Promise((r) => { const go = () => (n-- ? requestAnimationFrame(go) : r()); go(); });
    if (fn === 'step') pb.stepFrame(1);
    else pb.seekTo(800);
    await ticks(5);
    return state.doc.frames[0].scheme.balls.main.x;
  }, fn);

  test('next frame while stopped', async ({ page }) => {
    await boot(page);
    await page.waitForFunction(() => !!document.querySelector('#timeline .tl-card'));
    const x0 = await twoFramesBallMoved(page);
    expect(await frame0BallAfter(page, 'step')).toBe(x0);
  });

  test('seeking while stopped', async ({ page }) => {
    await boot(page);
    const x0 = await twoFramesBallMoved(page);
    expect(await frame0BallAfter(page, 'seek')).toBe(x0);
  });
});
