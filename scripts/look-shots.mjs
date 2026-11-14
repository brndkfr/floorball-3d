// Before / after pictures of the 3D view (S-BACK-030 step 0). Not a test
// and not part of CI: it saves PNGs of fixed camera poses so a look or
// animation change can be judged by eye.
//
//   pnpm run look                 -> test-results/look/<view>.png
//   pnpm run look -- --out before -> test-results/look/before/<view>.png
//   pnpm run look -- --at 1200    -> seekTo(1200) before the pictures
//
// Uses the dev server on PORT (default 8000) when one is running, else
// starts scripts/serve-static.mjs for the duration of the run.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;
const URL = `http://localhost:${PORT}/`;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const outDir = path.join(ROOT, 'test-results', 'look', arg('--out') || '');
const atMs = arg('--at') == null ? null : Number(arg('--at'));

// [team, x, z, angle]: three attackers around goal A, three defenders.
const CHIPS = [
  [1, -3000, 9000, Math.PI], [1, 2500, 12000, Math.PI], [1, 0, 16000, Math.PI],
  [2, -1500, 6500, 0], [2, 2000, 7500, 0], [2, 500, 10500, 0],
];

// Perspective views: camera position and the point it looks at (mm).
// 'default' keeps whatever the app shows after "New play".
const VIEWS = {
  default: null,
  players: { from: [3500, 1700, 15500], to: [0, 800, 9000] },
  'goalie-a': { from: [1800, 1300, 7500], to: [0, 600, 3400] },
  shooter: { from: [0, 1650, 16000], to: [0, 600, 3000] },
  'behind-goal-b': { from: [0, 2600, 41500], to: [0, 500, 30000] },
};

async function serverUp() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve-static.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New play' }).click();

  await page.evaluate(async (chips) => {
    const c = await import('/src/authoring/chips.js');
    const { exitTopDown } = await import('/src/authoring/topdown-camera.js');
    const { setFiguresEnabled } = await import('/src/authoring/figures.js');
    for (const [team, x, z, angle] of chips) c.spawnChip({ team, x, z, number: c.nextNumber(team), angle });
    exitTopDown();
    setFiguresEnabled(true);
  }, CHIPS);
  // Figures and the goalie load lazily; wait until both are in the scene.
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0);
  for (let i = 0; i < 100; i++) {
    const ready = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { figuresLoaded } = await import('/src/authoring/figures.js');
      return figuresLoaded() && !!state.goalieModels?.detailed && state.chipGroups.every((g) => g.userData.figure);
    });
    if (ready) break;
    await page.waitForTimeout(100);
  }
  if (atMs != null) {
    await page.evaluate(async (ms) => (await import('/src/authoring/playback.js')).seekTo(ms), atMs);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const shoot = async (name) => {
    await page.waitForTimeout(400); // a few rendered frames
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(path.relative(ROOT, path.join(outDir, `${name}.png`)));
  };

  for (const [name, view] of Object.entries(VIEWS)) {
    if (view) {
      await page.evaluate(async ({ from, to }) => {
        const { camera, lookAtFrom } = await import('/src/scene.js');
        camera.position.set(...from);
        lookAtFrom(camera.position, { x: to[0], y: to[1], z: to[2] });
      }, view);
    }
    await shoot(name);
  }

  await page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).enterTopDown());
  await shoot('top-down');

  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server?.kill();
}
