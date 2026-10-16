// S-BACK-029 H2: an untrusted doc (share link, saved project) must never
// stop the app from booting. Before H2, a #doc= link with e.g. a zone
// without `points` was saved as the current project and then threw inside
// authoring/index.js's top-level await, on every reload, until the user
// cleared site storage.

import { deflateRawSync } from 'node:zlib';
import { test, expect, waitUntil } from './fixtures.js';

const TRI = [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 0, z: 4000 }];

function shareHash(doc) {
  return '#doc=' + deflateRawSync(Buffer.from(JSON.stringify(doc))).toString('base64url');
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function waitForBootstrap(page) {
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

test('a share link with malformed entries boots and keeps the valid parts', async ({ page }) => {
  const errors = collectPageErrors(page);
  const doc = {
    version: 2,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: {
        players: { p_null: null, p_ok: { id: 'p_ok', team: 1, number: '7', x: 0, z: 0, label: 5 } },
        shapes: [
          { id: 'z_nopoints', type: 'zone' },
          { id: 'z_ok', type: 'zone', points: TRI, layer: 'x', label: 5 },
        ],
      },
    }],
  };
  await page.goto('/' + shareHash(doc), { waitUntil: 'load' });
  await waitForBootstrap(page);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return state.doc.scheme.shapes.map((s) => s.id).join() === 'z_ok'
      && Object.keys(state.doc.scheme.players).join() === 'p_ok'
      && state.shapeObjects.length === 1;
  });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

// Fault injection for the last line of defence: a doc that passes
// validation but still throws while rebuilding (here: measureText throws
// for one sentinel string) must be set aside, not brick the boot.
test('a project that throws during rebuild is set aside and a fresh one opens', async ({ page }) => {
  const errors = collectPageErrors(page);
  const bad = {
    version: 2,
    meta: { id: 'proj_bad', name: 'Bad project', createdAt: 1, modifiedAt: 1 },
    currentFrame: 0,
    frames: [{ id: 'f_1', duration: 1000, scheme: { players: {}, balls: {}, cones: [], shapes: [
      { id: 's_boom', type: 'text', text: '__boom__', x: 0, z: 0 },
    ] } }],
  };
  await page.addInitScript(() => {
    const orig = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      if (text === '__boom__') throw new Error('injected rebuild failure');
      return orig.call(this, text);
    };
  });
  await page.goto('/assets/rink.mtl');
  await page.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem('floorball-3d:migrated:v1', '1');
    localStorage.setItem('floorball-3d:project:proj_bad', JSON.stringify(d));
    localStorage.setItem('floorball-3d:currentProjectId', 'proj_bad');
  }, bad);
  await page.goto('/', { waitUntil: 'load' });
  await waitForBootstrap(page);

  await expect(page.locator('dialog.app-dialog')).toContainText('could not be opened');
  const after = await page.evaluate(() => ({
    current: localStorage.getItem('floorball-3d:currentProjectId'),
    badKept: !!localStorage.getItem('floorball-3d:project:proj_bad'),
  }));
  expect(after.current).not.toBe('proj_bad');
  expect(after.badKept).toBe(true);
  expect(errors).toEqual([]);
});
