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

// Centre of card `i`'s delete button, and whether a click there hits it.
const delHit = (page, i) => page.evaluate((i) => {
  const btn = document.querySelectorAll('#timeline .tl-card')[i].querySelector('[data-a="del"]');
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return { x, y, hits: document.elementFromPoint(x, y) === btn };
}, i);

test.describe('timeline strip on a narrow window', () => {
  test.use({ viewport: { width: 700, height: 700 } });

  test('each delete button sits inside its card', async ({ page }) => {
    await boot(page);
    await addFrames(page, 2);
    const outside = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-card')].filter((card) => {
      const c = card.getBoundingClientRect();
      const b = card.querySelector('[data-a="del"]').getBoundingClientRect();
      return b.left < c.left || b.right > c.right;
    }).length);
    expect(outside).toBe(0);
  });

  test('wheel scrolls an overflowing strip so the last frame can be deleted', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    await addFrames(page, 5);
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    const strip = page.locator('#timeline .tl-strip');
    const overflow = await strip.evaluate((s) => s.scrollWidth - s.clientWidth);
    expect(overflow).toBeGreaterThan(10);
    expect((await delHit(page, 5)).hits).toBe(false);

    const box = await strip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 120);
    const hit = await delHit(page, 5);
    expect(hit.hits).toBe(true);

    await page.mouse.click(hit.x, hit.y);
    await expect.poll(() => frameCount(page)).toBe(5);
    expect(errors).toEqual([]);
  });

  test('re-rendering the strip keeps its scroll position', async ({ page }) => {
    await boot(page);
    await addFrames(page, 5);
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
    await addFrames(page, 5);
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
    await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(5));
    const inView = await page.evaluate(() => {
      const s = document.querySelector('#timeline .tl-strip').getBoundingClientRect();
      const c = document.querySelector('#timeline .tl-card.editing').getBoundingClientRect();
      return c.left >= s.left - 1 && c.right <= s.right + 1;
    });
    expect(inView).toBe(true);
  });
});
