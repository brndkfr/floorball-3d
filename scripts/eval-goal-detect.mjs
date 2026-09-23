// Batch eval harness for goal auto-detect (B-BACK-010 step 2). Local-only,
// not a CI gate: the fixture photos in test/fixtures/goals/ are git-ignored.
//
//   pnpm eval:goals                    all labelled photos x all ROIs
//   pnpm eval:goals -- --only Hardau   photos whose name contains "Hardau"
//   pnpm eval:goals -- --roi tight     only that ROI variant
//   pnpm eval:goals -- --truth x.json  score against another truth file
//   pnpm eval:goals -- --model-fit     detectGoal({ modelFit: true }) (step 3.1),
//                                      written to test-results/goal-eval-model/
//
// Runs the real detectGoal() (web/src/authoring/photo-overlay/detect.js)
// in headless Chromium against truth.json (written by `pnpm label:goals`).
// Prints per-case corner error as a fraction of the true goal height and a
// pass rate (pass = all 4 corners within PASS_FRAC). Writes to
// test-results/goal-eval/: summary.json, summary.md, an overlay JPEG per
// case (green = truth, red = detected, yellow = ROI) and, for every
// failure, the detectGoal debug dump (Hough lines + scored candidates).
// Note `pnpm test:e2e` wipes test-results/, so re-run after e2e.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerErrors, goalHeight, roiVariants, PASS_FRAC } from './goal-eval-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'goals');
const modelFit = process.argv.includes('--model-fit');
const OUT = path.join(ROOT, 'test-results', modelFit ? 'goal-eval-model' : 'goal-eval');
const BASE = 'http://localhost:8000';

const args = process.argv.slice(2);
const argVal = (flag) => { const i = args.indexOf(flag); return i === -1 ? null : args[i + 1]; };
const only = argVal('--only');
const roiOnly = argVal('--roi');
const truthPath = argVal('--truth') || path.join(FIXTURES, 'truth.json');

const slug = (s) => s.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const pct = (v) => (v === Infinity ? '  -  ' : (v * 100).toFixed(1).padStart(5) + '%');

async function ensureServer() {
  const up = () => fetch(BASE + '/').then((r) => r.ok, () => false);
  if (await up()) return null;
  const child = spawn(process.execPath, [path.join(HERE, 'serve-static.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await up()) return child;
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('serve-static.mjs did not come up on :8000');
}

const truthText = await fs.readFile(truthPath, 'utf8').catch(() => {
  console.error(`No ${path.relative(ROOT, truthPath)} yet - run \`pnpm label:goals\` first.`);
  process.exit(1);
});
// Tolerate a BOM: Windows PowerShell 5.1 adds one when hand-editing.
const truth = JSON.parse(truthText.replace(/^﻿/, ''));
const photos = Object.entries(truth.photos)
  .filter(([n, e]) => !e.skip && e.corners?.length === 4 && (!only || n.includes(only)))
  .sort(([a], [b]) => a.localeCompare(b));
if (!photos.length) { console.error('No labelled photos match.'); process.exit(1); }

const server = await ensureServer();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));

// The eval page and the fixtures are served from disk by Playwright itself,
// at the dev server's origin: pnp.js loads OpenCV via the relative URL
// 'lib/opencv.js', so the page must live at the web root.
// Reuse index.html's import map (detect.js pulls in 'three' transitively),
// read at runtime so the two can't drift apart.
const indexHtml = await fs.readFile(path.join(ROOT, 'web', 'index.html'), 'utf8');
const importMap = indexHtml.match(/<script type="importmap">[\s\S]*?<\/script>/)?.[0] ?? '';
await page.route('**/__goal-eval.html', (r) => r.fulfill({
  contentType: 'text/html', body: `<!doctype html><title>goal eval</title>${importMap}`,
}));
await page.route('**/__fixtures/**', async (r) => {
  const name = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop());
  r.fulfill({ path: path.join(FIXTURES, path.basename(name)) });
});
// Chromium caches ES modules aggressively (CLAUDE.md) - make sure we
// evaluate the detect.js that's on disk now.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.clearBrowserCache');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto(BASE + '/__goal-eval.html');
await page.evaluate(async () => {
  window.__detect = await import('/src/authoring/photo-overlay/detect.js');
});

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, 'overlays'), { recursive: true });
await fs.mkdir(path.join(OUT, 'debug'), { recursive: true });

const results = [];
for (const [name, entry] of photos) {
  const rois = roiVariants(entry.corners, entry.w, entry.h);
  const cases = Object.entries(rois).filter(([k]) => !roiOnly || k === roiOnly);
  const out = await page.evaluate(async ({ url, cases, truthCorners, modelFit }) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const res = [];
    for (const [roiName, roi] of cases) {
      const debug = {};
      let corners = null, error = null;
      const t0 = performance.now();
      try {
        corners = (await window.__detect.detectGoal(img, roi, { debug, modelFit }))?.corners ?? null;
      } catch (e) {
        error = String(e?.stack || e);
      }
      const ms = performance.now() - t0;

      // Overlay: crop around ROI + truth, scaled to <= 1000 px wide.
      const xs = [roi.x, roi.x + roi.w, ...truthCorners.map((p) => p[0])];
      const ys = [roi.y, roi.y + roi.h, ...truthCorners.map((p) => p[1])];
      const pad = 20;
      const cx0 = Math.max(0, Math.min(...xs) - pad), cy0 = Math.max(0, Math.min(...ys) - pad);
      const cx1 = Math.min(img.naturalWidth, Math.max(...xs) + pad);
      const cy1 = Math.min(img.naturalHeight, Math.max(...ys) + pad);
      const s = Math.min(1000 / (cx1 - cx0), 4);
      const cv = document.createElement('canvas');
      cv.width = Math.round((cx1 - cx0) * s); cv.height = Math.round((cy1 - cy0) * s);
      const g = cv.getContext('2d');
      g.drawImage(img, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, cv.width, cv.height);
      const P = ([x, y]) => [(x - cx0) * s, (y - cy0) * s];
      const quad = (pts, color, w) => {
        g.strokeStyle = color; g.lineWidth = w; g.beginPath();
        pts.map(P).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath(); g.stroke();
        g.fillStyle = color;
        pts.map(P).forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
      };
      g.setLineDash([6, 4]); g.strokeStyle = '#ffd400'; g.lineWidth = 2;
      g.strokeRect(...P([roi.x, roi.y]), roi.w * s, roi.h * s);
      g.setLineDash([]);
      quad(truthCorners, '#00e676', 2);
      if (corners) quad(corners, '#ff1744', 2);
      res.push({ roiName, roi, corners, error, ms, debug, overlay: cv.toDataURL('image/jpeg', 0.85) });
    }
    return res;
  }, { url: '/__fixtures/' + encodeURIComponent(name), cases, truthCorners: entry.corners, modelFit });

  for (const r of out) {
    const score = cornerErrors(entry.corners, r.corners);
    const id = `${slug(name)}--${r.roiName}`;
    const status = r.error ? 'CRASH' : !r.corners ? 'miss' : score.pass ? 'PASS' : 'fail';
    await fs.writeFile(path.join(OUT, 'overlays', id + '.jpg'),
      Buffer.from(r.overlay.split(',')[1], 'base64'));
    if (status !== 'PASS') {
      await fs.writeFile(path.join(OUT, 'debug', id + '.json'), JSON.stringify({
        photo: name, roi: r.roiName, roiRect: r.roi, truth: entry.corners,
        detected: r.corners, error: r.error, score, debug: r.debug,
      }, null, 1));
    }
    results.push({
      photo: name, roi: r.roiName, status, expectFail: !!entry.expectFail,
      detected: r.corners, source: r.debug.source ?? null, maxErr: score.max, perCorner: score.perCorner,
      orderOk: score.orderOk, goalPx: Math.round(goalHeight(entry.corners)), ms: Math.round(r.ms),
      error: r.error,
    });
  }
}

await browser.close();
server?.kill();

// ---- report ---------------------------------------------------------------
const roiNames = [...new Set(results.map((r) => r.roi))];
const scored = results.filter((r) => !r.expectFail);
const passed = scored.filter((r) => r.status === 'PASS').length;
const within = (f) => scored.filter((r) => r.maxErr <= f).length;
const crashes = results.filter((r) => r.status === 'CRASH').length;

const lines = [];
const w = Math.min(44, Math.max(...photos.map(([n]) => n.length)));
lines.push(`${'photo'.padEnd(w)}  ${'goal'.padStart(5)}  ${roiNames.map((n) => n.padStart(13)).join('')}`);
for (const [name, entry] of photos) {
  const row = roiNames.map((rn) => {
    const r = results.find((x) => x.photo === name && x.roi === rn);
    const tag = { PASS: 'ok', fail: 'x', miss: '--', CRASH: '!!' }[r.status];
    const src = r.source ? r.source[0] : ' ';
    return `${tag.padStart(2)} ${src} ${pct(r.maxErr)}`.padStart(13);
  });
  lines.push(`${(name.length > w ? name.slice(0, w - 1) + '~' : name).padEnd(w)}  ${String(Math.round(goalHeight(entry.corners))).padStart(4)}px${row.join('')}${entry.expectFail ? '  (expected fail)' : ''}`);
}
lines.push('');
lines.push('cell = status, source (f=frame fit, p=posts, c=contour), worst-corner error / goal height');
lines.push('');
lines.push(`pass (all corners <= ${PASS_FRAC * 100}%): ${passed}/${scored.length} = ${(100 * passed / scored.length).toFixed(0)}%`
  + `   <=10%: ${within(0.1)}   <=25%: ${within(0.25)}   miss: ${scored.filter((r) => r.status === 'miss').length}`
  + `   crash: ${crashes}   (expected-fail cases excluded: ${results.length - scored.length})`);
for (const rn of roiNames) {
  const rs = scored.filter((r) => r.roi === rn);
  lines.push(`  ${rn.padEnd(6)} ${rs.filter((r) => r.status === 'PASS').length}/${rs.length}`);
}
const wrongOrder = results.filter((r) => r.detected && r.perCorner && !r.orderOk).length;
if (wrongOrder) lines.push(`  corner order differs from TL/TR/BR/BL in ${wrongOrder} detections`);
const drafts = photos.filter(([, e]) => e.draft).length;
if (drafts) {
  lines.push('', `WARNING: ${drafts}/${photos.length} labels are unconfirmed drafts - not a valid baseline.`
    + ' Confirm them in `pnpm label:goals` first.');
}
lines.push('', `overlays + debug: ${path.relative(ROOT, OUT)}`);

const report = lines.join('\n');
console.log(report);
await fs.writeFile(path.join(OUT, 'summary.md'), '```\n' + report + '\n```\n');
await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify({
  date: new Date().toISOString(), passFrac: PASS_FRAC, passed, total: scored.length, results,
}, null, 1));
process.exit(crashes ? 2 : 0);
