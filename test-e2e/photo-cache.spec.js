// S-BACK-029 M9: the last analysed match photo is cached in IndexedDB so a
// reload doesn't need re-picking. It used to stay there forever with no way
// to remove it from the UI - for a U14 team that is a photo of minors. Now:
// a visible "Forget saved photo" control, and records older than 7 days are
// deleted instead of restored.

import { test, expect } from './fixtures.js';

// 1x1 PNG - just enough for photo-canvas.js's Image() decode.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const DAY = 24 * 60 * 60 * 1000;

async function bootAnalyze(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await page.locator('[data-mode="analyze"]').click();
  await page.locator('[data-panel="photoPanel"]').click();
}

// Reads the raw cache record (or null) straight from IndexedDB.
function readCache(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('floorball-photo-cache', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const get = req.result.transaction('photos', 'readonly').objectStore('photos').get('last');
      get.onsuccess = () => {
        const r = get.result;
        req.result.close();
        resolve(r ? { name: r.name, savedAt: r.savedAt ?? null } : null);
      };
      get.onerror = () => reject(get.error);
    };
  }));
}

function writeCache(page, savedAt) {
  return page.evaluate(({ b64, savedAt }) => new Promise((resolve, reject) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const req = indexedDB.open('floorball-photo-cache', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('photos', 'readwrite');
      const rec = { blob, name: 'old.png', size: blob.size, lastModified: 0 };
      if (savedAt != null) rec.savedAt = savedAt;
      tx.objectStore('photos').put(rec, 'last');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { b64: TINY_PNG.toString('base64'), savedAt });
}

test('a picked photo is cached with a timestamp and can be forgotten', async ({ page }) => {
  await bootAnalyze(page);
  const forget = page.locator('#photoForgetBtn');
  await expect(forget).toBeHidden();

  await page.setInputFiles('#photoFileInput', { name: 'shot.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(forget).toBeVisible();
  await expect.poll(() => readCache(page)).toMatchObject({ name: 'shot.png' });
  const { savedAt } = await readCache(page);
  expect(Math.abs(savedAt - Date.now())).toBeLessThan(60_000);

  await forget.click();
  await expect.poll(() => readCache(page)).toBeNull();
  await expect(forget).toBeHidden();
  await expect(page.locator('#photoForgetStatus')).toContainText('removed');

  // Nothing comes back after a reload.
  await bootAnalyze(page);
  await page.waitForTimeout(500);
  await expect(page.locator('#photo-canvas')).toBeHidden();
});

test('a fresh cached photo is restored on reload and offers Forget', async ({ page }) => {
  await bootAnalyze(page);
  await writeCache(page, Date.now() - 1 * DAY);
  await bootAnalyze(page);
  await expect(page.locator('#photo-canvas')).toBeVisible();
  await expect(page.locator('#photoForgetBtn')).toBeVisible();
});

for (const [label, savedAt] of [['older than 7 days', Date.now() - 8 * DAY], ['from before M9 (no timestamp)', null]]) {
  test(`a cached photo ${label} is deleted instead of restored`, async ({ page }) => {
    await bootAnalyze(page);
    await writeCache(page, savedAt);
    await bootAnalyze(page);
    await expect.poll(() => readCache(page)).toBeNull();
    await expect(page.locator('#photo-canvas')).toBeHidden();
    await expect(page.locator('#photoForgetBtn')).toBeHidden();
  });
}
