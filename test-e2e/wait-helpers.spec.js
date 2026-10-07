// S-BUG-001: the shared wait helpers in fixtures.js must actually wait.
// page.waitForFunction() with an async predicate resolved after one poll
// whatever the predicate returned, so waitForAssets() never waited for anything.

import { test, expect, waitUntil, waitForAssets } from './fixtures.js';

test('waitUntil times out on an async predicate that stays false', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(waitUntil(page, async () => false, undefined, { timeout: 1000 })).rejects.toThrow();
});

test('waitUntil resolves once an async predicate turns true', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => { setTimeout(() => { window.__flag = true; }, 400); });
  await waitUntil(page, async () => !!window.__flag, undefined, { timeout: 5000 });
  expect(await page.evaluate(() => window.__flag)).toBe(true);
});

test('waitForAssets blocks while a load is pending', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.evaluate(async () => (await import('/src/status.js')).expectLoad('fake.obj'));
  await expect(waitForAssets(page, { timeout: 1000 })).rejects.toThrow();
  await page.evaluate(async () => (await import('/src/status.js')).loaded('fake.obj'));
  await waitForAssets(page, { timeout: 5000 });
});
