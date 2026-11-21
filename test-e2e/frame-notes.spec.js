// A-BACK-035: frame notes. "Add note..." in a frame's menu; a marker on the
// frame card; the note as a caption at the bottom of the stage for the
// current frame and while it plays; undo, reload and Present keep working;
// the caption is in screenshots and burned into the export.
// seekTo() is called directly: rAF frames are unreliable in Playwright tabs.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup;
  });
}

const caption = (page) => page.locator('#frameCaption');
const card = (page, i) => page.locator('#timeline .tl-card').nth(i);

async function addNote(page, i, text) {
  await card(page, i).locator('.tl-menu').click();
  await page.locator('#tlFrameMenu').getByRole('menuitem', { name: /note/ }).click();
  const input = page.locator('.app-dialog-input');
  await input.fill(text);
  await page.getByRole('button', { name: 'OK' }).click();
}

const twoFrames = (page) => page.evaluate(async () => {
  const { duplicateFrame, selectFrame } = await import('/src/authoring/frames.js');
  duplicateFrame(0, 1);
  selectFrame(0);
});

test('Add note from the frame menu: stored on the frame, marked on the card, shown as the caption', async ({ page }) => {
  await boot(page);
  await expect(caption(page)).toBeHidden();
  await addNote(page, 0, 'Weak-side D slides to the slot');
  expect(await page.evaluate(async () => (await import('/src/authoring/doc.js')).ensureDoc().frames[0].note)).toBe('Weak-side D slides to the slot');
  await expect(card(page, 0).locator('.tl-note')).toHaveAttribute('title', 'Weak-side D slides to the slot');
  await expect(caption(page)).toBeVisible();
  await expect(caption(page)).toHaveText('Weak-side D slides to the slot');
  // the menu now offers to edit it
  await card(page, 0).locator('.tl-menu').click();
  await expect(page.locator('#tlFrameMenu').getByRole('menuitem', { name: 'Edit note…' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the caption follows the frame: current frame when stopped, the playing move during playback', async ({ page }) => {
  await boot(page);
  await twoFrames(page);
  await addNote(page, 0, 'Pass to the slot');
  await card(page, 1).click();
  await expect(caption(page)).toBeHidden();                         // frame 2 has no note
  const at = async (ms) => {
    await page.evaluate(async (t) => { (await import('/src/authoring/playback.js')).seekTo(t); (await import('/src/authoring/frame-caption.js')).updateFrameCaption(); }, ms);
  };
  await at(200);
  await expect(caption(page)).toHaveText('Pass to the slot');
  await at(999999);
  await expect(caption(page)).toBeHidden();
});

test('undo removes a note; a saved note survives a reload; Present shows it', async ({ page }) => {
  await boot(page);
  await addNote(page, 0, 'Shot from the slot');
  await page.keyboard.press('Control+z');
  await expect(caption(page)).toBeHidden();
  await page.keyboard.press('Control+y');
  await expect(caption(page)).toHaveText('Shot from the slot');
  await boot(page);
  await expect(caption(page)).toHaveText('Shot from the slot');
  await page.locator('#appTopbar [data-action="present"]').click();
  await expect(caption(page)).toBeVisible();
});

// Pixels that differ between two captures in the bottom-centre strip.
const bottomDiff = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++;
  return n;
};

test('the caption is in screenshots and burned into the exported image', async ({ page }) => {
  await boot(page);
  await addNote(page, 0, 'Weak-side D slides to the slot');
  const grab = () => page.evaluate(async () => {
    const strip = async (canvas) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      return Array.from(ctx.getImageData(Math.round(w * 0.3), Math.round(h * 0.8), Math.round(w * 0.4), Math.round(h * 0.18)).data);
    };
    const { captureStage } = await import('/src/screenshot.js');
    const { exportPng } = await import('/src/authoring/export.js');
    const img = new Image();
    img.src = exportPng({ width: 640, height: 360 });
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    c.getContext('2d').drawImage(img, 0, 0);
    return { shot: await strip(await captureStage({})), png: await strip(c) };
  });
  const withNote = await grab();
  await page.evaluate(async () => (await import('/src/authoring/frames.js')).setFrameNote(0, ''));
  const without = await grab();
  expect(bottomDiff(withNote.shot, without.shot)).toBeGreaterThan(200);
  expect(bottomDiff(withNote.png, without.png)).toBeGreaterThan(200);
});

test('the caption never sits on the floating dock', async ({ page }) => {
  await boot(page);
  await addNote(page, 0, 'Weak-side D slides to the slot');
  const cap = await caption(page).boundingBox();
  const dock = await page.locator('#dock').boundingBox();
  expect(cap.y + cap.height).toBeLessThanOrEqual(dock.y);
});
