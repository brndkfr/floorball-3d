// Local-only labelling tool for the goal auto-detect eval set (B-BACK-010).
//
//   pnpm label:goals        -> http://localhost:8010/
//
// Lists every image in test/fixtures/goals/, lets you click the 4 goal-mouth
// corners per photo, and auto-saves them to test/fixtures/goals/truth.json,
// which scripts/eval-goal-detect.mjs scores detectGoal() against. Not part
// of the app or CI; dependency-free like serve-static.mjs.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '..', 'test', 'fixtures', 'goals');
const TRUTH = path.join(DIR, 'truth.json');
const PORT = Number(process.env.PORT) || 8010;
const IMG = /\.(png|jpe?g|webp)$/i;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function readTruth() {
  try { return JSON.parse(await fs.readFile(TRUTH, 'utf8')); } catch { return { version: 1, photos: {} }; }
}

async function serve(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);
    if (p === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    } else if (p === '/api/photos') {
      const names = (await fs.readdir(DIR)).filter((n) => IMG.test(n)).sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(names));
    } else if (p === '/api/truth' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await readTruth()));
    } else if (p === '/api/truth' && req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body); // throws -> 500, file untouched
      // Write-then-rename so a crash mid-write never leaves a truncated file.
      await fs.writeFile(TRUTH + '.tmp', JSON.stringify(data, null, 2) + '\n');
      await fs.rename(TRUTH + '.tmp', TRUTH);
      res.writeHead(204); res.end();
    } else if (p.startsWith('/img/')) {
      const name = path.basename(p.slice(5));
      if (!IMG.test(name)) { res.writeHead(404); res.end(); return; }
      const body = await fs.readFile(path.join(DIR, name));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(name).toLowerCase()] });
      res.end(body);
    } else {
      res.writeHead(404); res.end('not found');
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Goal Labeller</title>
<style>
  :root { --bg:#16181d; --panel:#1f232b; --line:#2e333d; --fg:#e6e8ec; --dim:#8b93a3; --acc:#4cc38a; --warn:#e5a13b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:13px/1.4 system-ui, sans-serif; display:grid; grid-template-columns:280px 1fr; height:100vh; }
  aside { background:var(--panel); border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0; }
  aside h1 { font-size:14px; margin:12px 12px 4px; }
  #progress { color:var(--dim); margin:0 12px 8px; }
  ul { list-style:none; margin:0; padding:0; overflow:auto; flex:1; }
  li { padding:6px 12px; cursor:pointer; display:flex; gap:8px; align-items:baseline; border-left:3px solid transparent; }
  li:hover { background:#262b35; }
  li.cur { background:#2a303b; border-left-color:var(--acc); }
  li .st { width:14px; flex:none; text-align:center; }
  li .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .done .st { color:var(--acc); } .skip .st, .skip .nm { color:var(--dim); } .part .st, .draft .st { color:var(--warn); }
  #step.draft { color:var(--warn); }
  .help { border-top:1px solid var(--line); padding:10px 12px; color:var(--dim); }
  .help b { color:var(--fg); font-weight:600; }
  .help kbd { background:#2a303b; border:1px solid var(--line); border-radius:3px; padding:0 4px; font-size:11px; color:var(--fg); }
  main { display:flex; flex-direction:column; min-width:0; min-height:0; }
  header { padding:8px 12px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header .step { font-weight:600; }
  header .step em { color:var(--acc); font-style:normal; }
  header label { color:var(--dim); display:flex; gap:6px; align-items:center; }
  header input[type=text] { background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:4px; padding:3px 6px; width:260px; }
  #saved { margin-left:auto; color:var(--dim); }
  #wrap { position:relative; flex:1; min-height:0; overflow:hidden; cursor:crosshair; }
  canvas { position:absolute; inset:0; }
</style></head>
<body>
<aside>
  <h1>Goal mouth corners</h1>
  <div id="progress"></div>
  <ul id="list"></ul>
  <div class="help">
    Click the <b>4 corners of the goal mouth</b> (the front frame: posts + crossbar),
    on the <b>tube centre line</b>, in order
    <b>top-left, top-right, bottom-right, bottom-left</b> as seen on screen.
    Goal seen from behind: still label the mouth frame, not the back frame.<br><br>
    <kbd>pinch</kbd> / <kbd>wheel</kbd> / <kbd>+</kbd><kbd>-</kbd> zoom &middot;
    <kbd>two-finger scroll</kbd> / <kbd>space</kbd>+drag / <kbd>right-drag</kbd> pan &middot;
    drag a point to move it<br>
    <kbd>Backspace</kbd> undo &middot; <kbd>R</kbd> reset &middot; <kbd>F</kbd> fit<br>
    <kbd>N</kbd>/<kbd>&rarr;</kbd> next &middot; <kbd>P</kbd>/<kbd>&larr;</kbd> prev &middot;
    <kbd>S</kbd> skip photo &middot; <kbd>X</kbd> expected fail<br>
    <b>?</b> = unconfirmed draft: fix the points, then <kbd>Enter</kbd> to confirm
  </div>
</aside>
<main>
  <header>
    <span class="step" id="step"></span>
    <label><input type="checkbox" id="expectFail"> expected fail</label>
    <label><input type="checkbox" id="skip"> skip</label>
    <label>note <input type="text" id="note" placeholder="e.g. goalie hides left post"></label>
    <span id="saved"></span>
  </header>
  <div id="wrap"><canvas id="cv"></canvas></div>
</main>
<script>
const NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const SHORT = ['TL', 'TR', 'BR', 'BL'];
let photos = [], truth = { version: 1, photos: {} }, idx = 0;
let img = null, view = { s: 1, x: 0, y: 0 };
let drag = null, spaceDown = false, saveTimer = null, lastPtr = null;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), wrap = document.getElementById('wrap');

const cur = () => photos[idx];
const entry = (name = cur()) => (truth.photos[name] ||= { corners: [] });
const status = (name) => {
  const e = truth.photos[name];
  if (!e) return '';
  if (e.skip) return 'skip';
  if (e.draft) return 'draft';
  return e.corners?.length === 4 ? 'done' : e.corners?.length ? 'part' : '';
};

async function init() {
  [photos, truth] = await Promise.all([
    fetch('/api/photos').then((r) => r.json()),
    fetch('/api/truth').then((r) => r.json()),
  ]);
  truth.photos ||= {};
  const firstTodo = photos.findIndex((n) => !['done', 'skip'].includes(status(n)));
  load(firstTodo === -1 ? 0 : firstTodo);
}

function renderList() {
  const ul = document.getElementById('list');
  ul.innerHTML = '';
  photos.forEach((n, i) => {
    const li = document.createElement('li');
    const st = status(n);
    li.className = st + (i === idx ? ' cur' : '');
    li.innerHTML = '<span class="st">' + ({ done: '&#10003;', skip: '&ndash;', part: '&#9679;', draft: '?' }[st] || '') +
      '</span><span class="nm"></span>';
    li.querySelector('.nm').textContent = n;
    li.title = n;
    li.onclick = () => load(i);
    ul.appendChild(li);
  });
  const done = photos.filter((n) => ['done', 'skip'].includes(status(n))).length;
  document.getElementById('progress').textContent = done + ' / ' + photos.length + ' labelled';
  ul.children[idx]?.scrollIntoView({ block: 'nearest' });
}

function load(i) {
  idx = (i + photos.length) % photos.length;
  const e = entry();
  document.getElementById('note').value = e.note || '';
  document.getElementById('skip').checked = !!e.skip;
  document.getElementById('expectFail').checked = !!e.expectFail;
  img = new Image();
  img.onload = () => {
    e.w = img.naturalWidth; e.h = img.naturalHeight;
    fit(); draw();
  };
  img.src = '/img/' + encodeURIComponent(cur());
  renderList(); updateStep();
}

function fit() {
  const r = wrap.getBoundingClientRect();
  cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  if (!img?.naturalWidth) return;
  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight) * 0.97;
  view = { s, x: (r.width - img.naturalWidth * s) / 2, y: (r.height - img.naturalHeight * s) / 2 };
}

const toImg = (sx, sy) => [(sx - view.x) / view.s, (sy - view.y) / view.s];
const toScr = ([ix, iy]) => [ix * view.s + view.x, iy * view.s + view.y];

function draw() {
  const d = devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d0f12'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!img?.naturalWidth) return;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  // Crisp pixels when zoomed in - you're placing sub-tube-width points.
  ctx.imageSmoothingEnabled = view.s < 2;
  ctx.drawImage(img, view.x, view.y, img.naturalWidth * view.s, img.naturalHeight * view.s);
  const pts = entry().corners.map(toScr);
  if (pts.length > 1) {
    ctx.strokeStyle = 'rgba(76,195,138,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (pts.length === 4) ctx.closePath();
    ctx.stroke();
  }
  pts.forEach(([x, y], i) => {
    // Hollow crosshair, so the exact spot stays visible under the marker.
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; cross(x, y);
    ctx.strokeStyle = '#4cc38a'; ctx.lineWidth = 1.5; cross(x, y);
    ctx.font = 'bold 12px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    ctx.strokeText(SHORT[i], x + 8, y - 8); ctx.fillStyle = '#4cc38a'; ctx.fillText(SHORT[i], x + 8, y - 8);
  });
}
function cross(x, y) {
  ctx.beginPath();
  ctx.moveTo(x - 10, y); ctx.lineTo(x - 3, y); ctx.moveTo(x + 3, y); ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 3); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 10);
  ctx.stroke();
}

function updateStep() {
  const e = entry(), n = e.corners.length;
  const stepEl = document.getElementById('step');
  stepEl.className = e.draft ? 'step draft' : 'step';
  stepEl.innerHTML = e.skip ? 'Skipped'
    : e.draft ? 'DRAFT - check every corner at high zoom, drag to fix, then <em>Enter</em> to confirm'
    : n < 4 ? 'Click <em>' + NAMES[n] + '</em> (' + (n + 1) + '/4)'
    : 'Done - <em>N</em> for next photo';
}

function changed() {
  renderList(); updateStep(); draw();
  document.getElementById('saved').textContent = 'saving...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const r = await fetch('/api/truth', { method: 'PUT', body: JSON.stringify(truth) });
    document.getElementById('saved').textContent = r.ok ? 'saved' : 'SAVE FAILED';
  }, 250);
}

function hit(sx, sy) {
  return entry().corners.findIndex((p) => { const [x, y] = toScr(p); return Math.hypot(x - sx, y - sy) < 9; });
}

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  const sx = e.offsetX, sy = e.offsetY;
  if (e.button === 2 || e.button === 1 || spaceDown) { drag = { pan: true, sx, sy, vx: view.x, vy: view.y }; return; }
  if (e.button !== 0) return;
  const h = hit(sx, sy);
  if (h !== -1) { drag = { point: h }; return; }
  const c = entry().corners;
  if (c.length < 4 && !entry().skip) {
    c.push(toImg(sx, sy).map((v) => Math.round(v * 10) / 10));
    changed();
  }
});
addEventListener('mousemove', (e) => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  lastPtr = [sx, sy];
  if (!drag) return;
  if (drag.pan) { view.x = drag.vx + sx - drag.sx; view.y = drag.vy + sy - drag.sy; draw(); }
  else { entry().corners[drag.point] = toImg(sx, sy).map((v) => Math.round(v * 10) / 10); draw(); drag.moved = true; }
});
addEventListener('mouseup', () => { if (drag?.moved) changed(); drag = null; });
function zoomAt(sx, sy, factor) {
  const [ix, iy] = toImg(sx, sy);
  view.s = Math.min(40, Math.max(0.05, view.s * factor));
  view.x = sx - ix * view.s; view.y = sy - iy * view.s;
  draw();
}
// Trackpad pinch arrives as a wheel event with ctrlKey set (small deltas);
// two-finger scroll as a plain wheel event with small / fractional / sideways
// deltas; a mouse wheel as whole ~100 px notches. Pinch + mouse wheel zoom,
// two-finger scroll pans.
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const trackpadScroll = !e.ctrlKey && e.deltaMode === 0
    && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);
  if (trackpadScroll) {
    view.x -= e.deltaX; view.y -= e.deltaY;
    draw();
  } else {
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { spaceDown = true; e.preventDefault(); }
  else if (k === 'backspace' || (k === 'z' && (e.ctrlKey || e.metaKey))) { entry().corners.pop(); changed(); }
  else if (k === 'r') { entry().corners = []; delete entry().draft; changed(); }
  else if (k === 'enter' && entry().draft && entry().corners.length === 4) {
    const e = entry();
    delete e.draft;
    // Double backslashes: this script lives inside the PAGE template literal,
    // which would otherwise eat single ones and break the regex.
    e.note = (e.note || '').replace(/^DRAFT \\([^)]*\\):\\s*/, '') || undefined;
    document.getElementById('note').value = e.note || '';
    changed();
  }
  else if (k === 'f') { fit(); draw(); }
  else if (k === '+' || k === '=' || k === '-') {
    // Zoom around the last pointer position (or the centre).
    const r = wrap.getBoundingClientRect();
    zoomAt(lastPtr?.[0] ?? r.width / 2, lastPtr?.[1] ?? r.height / 2, k === '-' ? 1 / 1.5 : 1.5);
  }
  else if (k === 'n' || k === 'arrowright') load(idx + 1);
  else if (k === 'p' || k === 'arrowleft') load(idx - 1);
  else if (k === 's') { const c = document.getElementById('skip'); c.checked = !c.checked; c.onchange(); }
  else if (k === 'x') { const c = document.getElementById('expectFail'); c.checked = !c.checked; c.onchange(); }
});
addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
addEventListener('resize', () => { fit(); draw(); });
document.getElementById('skip').onchange = function () { entry().skip = this.checked || undefined; changed(); };
document.getElementById('expectFail').onchange = function () { entry().expectFail = this.checked || undefined; changed(); };
document.getElementById('note').oninput = function () { entry().note = this.value || undefined; changed(); };
init();
</script>
</body></html>`;

http.createServer(serve).listen(PORT, () => {
  console.log(`label-goals: http://localhost:${PORT}/  (saving to ${path.relative(process.cwd(), TRUTH)})`);
});
