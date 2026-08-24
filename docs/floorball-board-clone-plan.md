# Floorball Tactical Board - Clone Blueprint & Implementation Plan

> Handoff document. A new LLM session can use this as the single source of truth to
> scaffold and implement a floorball tactical-board web app inspired by
> [tactical-board.com](https://tactical-board.com/uk/floorball-vertical).
>
> This document contains: product scope, tech stack, data model, reverse-engineered
> reference behavior, code snippets for the hard parts, and a phased milestone plan.
>
> **Target repo:** new project (separate from `jets-taktik-hub`), tentative name
> `floorball-tactic-board`.

---

## 0. TL;DR

Build a web app for creating floorball tactical schemes and animations, with:

- SVG-based editor (vertical + horizontal rink)
- Drag players/ball, draw arrows/curves/zones/text
- Keyframe animation with Bezier curve paths
- Export to PNG (schemes), self-contained HTML (animation), MP4 (server-rendered)
- Auth, shareable links, personal collection, PRO tier (Stripe)

Model closely on tactical-board.com's data structures (they are good), but ship a
modern stack (Vite + ES modules, no jQuery/webpack polyfill soup, no preallocated
DOM pool).

---

## 1. Product scope

### MVP features (parity with tactical-board.com floorball)

- **Rink**: floorball vertical + horizontal, 26 x 14 m, correct markings
  (center dot, 4 face-off dots, goalie box, half-circles, corner arcs).
- **Static schemes**: place players (2 teams, jerseys 1..25), ball/puck/stick,
  draw shapes (arrow, dashed arrow, curved arrow, zone, text, freehand).
- **Animations**: keyframes, tweening, Bezier curved paths, playback controls
  (play, pause, stop, step, speed 1..9, repeat).
- **Share links**: server-persisted, short slug URLs.
- **Collection**: authenticated users can save/list schemes and animations.
- **Export**:
  - PNG (single frame)
  - HTML (self-playing, offline-capable)
  - MP4 (server-encoded, PRO-only)
- **Multi-language**: `de`, `en` at minimum.
- **PRO tier**: removes watermark, unlocks MP4 export, raises collection limits.
- **Crop rectangle**: user-defined 0..1 rect applied to image/video exports.
- **Toggle field markup**: hide rink lines for exports.

### Explicitly NOT in scope

- Other sports (soccer, hockey, basketball, etc.)
- Conference / screen share room
- Ads
- Native mobile app

---

## 2. Reference: how tactical-board.com works

Reverse-engineered from the live site (`/uk/floorball-vertical`).

### 2.1 Tech observations

- Vanilla JS webpack bundle (`/static/js/1.js`, ~1 MB, mostly core-js polyfills).
- Sport-specific script (`/static/js/board-markup-ov.js`) generates SVG rink lines.
- Only global exposed: `BoardMarkup`.
- PHP backend (`PHPSESSID` cookie), FastSpring for payments.
- Single SVG `#svg_canvas` with `viewBox 0 0 1397 937`.

### 2.2 SVG layers (top to bottom of z-order)

| Layer id | Purpose |
|---|---|
| `defs` | Patterns for player chips, balls, icons |
| `svg_bg_rect` | Background color |
| `board_svg_markup` | Static rink lines |
| `shapes_low_level_section` | Arrows/shapes under players |
| `shapes_middle_level_section` | Arrows/shapes at player z |
| `shapes_high_level_section` | Arrows/shapes on top |
| `players_section` | 500 preallocated player `<g>` nodes (do NOT copy this) |
| `balls_section` | 100 preallocated ball `<g>` nodes |
| `shape_shadow` | Drag ghost |

### 2.3 Storage (localStorage, wrapped as `{value, expires}`)

- `main_ov`, `main_bf`, ... one per sport = current static scene
- `animation_ov`, `animation_bf`, ... one per sport = current animation
- `board_selected` = active sport id
- `board_crop_points_<sport>` = normalized crop `{x1,y1,x2,y2}`
- `[[all_items_keys]]` = own key registry (for cleanup)
- `shown_tips`, `tip_shown` = onboarding flags

### 2.4 Scene JSON schema (static)

```json
{
  "players": {},
  "balls": {},
  "shapes": [],
  "hideBoardMarkup": false
}
```

### 2.5 Animation JSON schema

```json
{
  "frames": [ { "elements": {} } ],
  "frames_elements": {},
  "speed": 5,
  "repeat": true,
  "hideBoardMarkup": false
}
```

Each frame's `elements` is keyed by element id and stores `{pos: {s, e, im1?, im2?}, ang}`:

- `s` = start (position at previous frame's end)
- `e` = end (position at this frame)
- `im1`, `im2` = optional cubic Bezier control points (undefined = straight line)
- `ang` = rotation angle

`frames_elements` is a global registry for invariant props per element (team,
number, color, etc.) so per-frame entries stay small.

### 2.6 UI actions (data-action attrs, observed live)

`show-page-main`, `show-page-animation`, `page-get-link`, `download-animation`,
`animation-play`, `animation-play-current-frame`, `animation-pause`,
`animation-stop`, `animation-repeat`, `edit-animation`, `page-reset`,
`download-animation-as-html`, `download-animation-as-mp4`, `create-conference`.

### 2.7 MP4 export pipeline (from `_convertToMovie` in their bundle)

Two modes controlled by `inputParams.mm_create_raw_files_place`:

**Client mode (default):**

1. Compute deterministic `build` hash over: crop rect, bg color, marking colors,
   animation JSON, hide-markup flag, raw type, file width, start/end frame,
   `board_key`, userAgent (prefixed with userId).
   -> This hash is the server-side cache key: if MP4 already exists, return
   immediately.
2. Compute unique `job` id: `md5(build + Date.now() + performance.now() + UA)`.
3. Try primary `movie_maker_url`, fall back to `movie2_maker_url` after 5 s.
4. Replay animation via `_runFrames({timerDuration: 1, timerMethod: 'setTimeoutWorker'})`
   at max speed. Web Worker timer avoids background-tab throttling.
5. For every sub-step (`lineWayPointIndex` inside each keyframe transition):
   a. `Et.inlineImages(container, cb)` inlines every `<image href>` as base64.
   b. `Et.saveAsImage(container, {width, height, widthCoeff: .025, heightCoeff: .05, type: 'png'})`
      serializes SVG, draws into a `<canvas>`, calls `toDataURL('image/png')`.
   c. POST PNG to server as `<1e7 + 1e4*frameIndex + lineWayPointIndex>.png`.
      The `1e7 + ...` offset guarantees lexicographically sortable filenames
      for later ffmpeg concat.
   d. 3 retries per frame. Abort flag supported.
6. Server responds with `{status, build_exists, file_url, iframe_file_url}`.
7. When all frames uploaded, server stitches (ffmpeg) and returns final URLs.
8. Client displays result in an `<iframe src="${iframe_url}&lang=&fs=">`.

**Server mode (fallback for some sports):**

Client POSTs animation JSON + board size + viewBox + crop rect + screen dims to
`/logMovie`; server headless-renders and encodes.

No `MediaRecorder`, no `ffmpeg.wasm`, no `canvas.captureStream` in the bundle -
confirms everything is PNG-per-tick + server ffmpeg.

### 2.8 PRO gating

Free/expired PRO: no MP4 export at all (paywall modal).
PRO trial: forced `startFrame=1, endFrame=min(3, framesCount-1)`, `fileWidth<=1440`.
PRO active: full range, up to 1920px, no watermark.

---

## 3. Tech stack (recommended for the clone)

| Concern | Choice | Notes |
|---|---|---|
| Rendering | SVG + vanilla DOM | Cheap PNG export, free hit-test, no framework needed. |
| Build | Vite (ES modules, no polyfills) | Target evergreen browsers. ~50 KB bundle. |
| UI shell | Vanilla JS modules | React only if wired into an existing multi-page app. |
| State/undo | Custom immutable snapshot stack (~150 LOC) | See section 6.3. |
| Auth / share / collection | Cloudflare Workers + D1 + R2 | Or Supabase if preferred. |
| MP4 encoder | Server ffmpeg (Cloud Run, 512 MB image) | Same pattern as tactical-board. |
| Fast path MP4 | WebCodecs `VideoEncoder` + `mp4-muxer` | Chromium only, skips server. |
| Payments | Stripe Checkout + webhook | Sets `pro_expires` on user row. |
| i18n | JSON message bundles + `Intl` | No i18n framework. |
| Rink coordinates | rink meters * 100 (viewBox `0 0 2600 1400`) | Resolution-independent. |

---

## 4. Directory layout

```
floorball-tactic-board/
|-- index.html
|-- vite.config.js
|-- package.json
|-- src/
|   |-- main.js
|   |-- boards/
|   |   |-- floorball-h.js          # horizontal rink markings
|   |   \-- floorball-v.js          # vertical rink markings
|   |-- engine/
|   |   |-- scene.js                # SVG layer stack, add/remove/hit-test
|   |   |-- player.js               # Player factory
|   |   |-- ball.js
|   |   |-- shape.js                # arrow, curve, zone, text, freehand
|   |   |-- interaction.js          # Pointer Events drag/rotate
|   |   |-- snap.js                 # grid + face-off dot snap
|   |   \-- history.js              # undo/redo
|   |-- animation/
|   |   |-- model.js                # Frame data model
|   |   |-- timeline.js             # UI strip + add/remove/select frame
|   |   |-- player.js               # runFrames() + interpolation
|   |   |-- timer-worker.js         # setTimeout in Worker (no throttle)
|   |   |-- curveEditor.js          # Bezier handles per element per frame
|   |   \-- export.js               # captureFrame + PNG upload
|   |-- ui/
|   |   |-- toolbar.js
|   |   |-- palette.js              # player chips, colors, shape tools
|   |   |-- modal.js
|   |   \-- speed.js
|   |-- io/
|   |   |-- storage.js              # localStorage with {value, expires}
|   |   |-- api.js                  # fetch wrappers
|   |   \-- png.js                  # svg -> png via canvas.toDataURL
|   |-- i18n/
|   |   |-- de.json
|   |   |-- en.json
|   |   \-- index.js
|   \-- styles.css
\-- server/
    |-- worker.js                   # CF Worker: auth, share, collection
    \-- movie-maker/                # Cloud Run: ffmpeg stitcher
        |-- Dockerfile
        \-- server.js
```

---

## 5. Data model

### 5.1 Universal document

```ts
type Doc = {
  version: 1;
  sport: 'floorball-v' | 'floorball-h';
  bg: string;                             // hex, board background color
  crop: { x1: number; y1: number; x2: number; y2: number }; // 0..1
  hideMarkup: boolean;
  scheme: Scene;                          // static state (also frame 0 of animation)
  animation?: {
    speed: number;                        // 1..9
    repeat: boolean;
    frames: Frame[];                      // frames[0] === scheme snapshot
  };
};

type Scene = {
  players: Record<Id, Player>;
  balls: Record<Id, Ball>;
  shapes: Shape[];
};

type Player = {
  id: Id;
  team: 1 | 2;
  number: string;
  name?: string;
  color?: string;
  x: number; y: number;
  angle: number;
  scale?: number;
};

type Ball = {
  id: Id;
  kind: 'ball' | 'puck' | 'stick';
  x: number; y: number;
  angle: number;
};

type Shape =
  | { id: Id; type: 'arrow'|'dashed-arrow'|'curve'; layer: 'low'|'mid'|'high';
      color: string; width: number; points: [number,number][];
      curve?: 'linear'|'bezier' }
  | { id: Id; type: 'zone'; layer: 'low';
      color: string; opacity: number; points: [number,number][] }
  | { id: Id; type: 'text'; layer: 'high';
      x: number; y: number; text: string; color: string; size: number }
  | { id: Id; type: 'freehand'; layer: 'high';
      color: string; width: number; points: [number,number][] };

type Frame = {
  elements: Record<Id, {
    pos: {
      s: { x: number; y: number };        // start (== previous frame's end)
      e: { x: number; y: number };        // end
      im1?: { x: number; y: number };     // Bezier control 1 (curved path)
      im2?: { x: number; y: number };     // Bezier control 2
    };
    ang: number;
    style?: { color?: string; number?: string; name?: string };
    ease?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  }>;
  shapes?: Shape[];                       // shapes visible only during this frame
};
```

### 5.2 Backend schema (D1 / SQLite)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pro_expires INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE docs (
  id TEXT PRIMARY KEY,                    -- short slug, 6 chars b58
  user_id TEXT REFERENCES users(id),
  title TEXT,
  kind TEXT CHECK(kind IN ('scheme','animation')),
  json TEXT NOT NULL,                     -- the Doc JSON
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX docs_user ON docs(user_id, updated_at DESC);
```

### 5.3 Backend endpoints

```
POST /doc              -> create, returns { id }
GET  /doc/:id          -> returns Doc
PUT  /doc/:id          -> update (auth: owner only)
GET  /me/docs?kind=... -> paginated collection
POST /auth/google      -> OAuth -> JWT cookie
POST /billing/webhook  -> Stripe -> set pro_expires
GET  /movie/precheck   -> { exists, file_url }
POST /movie/upload     -> multipart PNG upload
POST /movie/finalize   -> ffmpeg stitch -> { file_url, iframe_url }
```

---

## 6. Key implementation details

### 6.1 SVG scene skeleton

```html
<svg id="board" viewBox="0 0 2600 1400" preserveAspectRatio="xMidYMid meet">
  <defs>
    <!-- patterns for player chip + ball icons -->
  </defs>
  <rect id="bg" width="100%" height="100%" fill="#c94a1e"/>
  <g id="markings"><!-- rink lines from boards/floorball-v.js --></g>
  <g id="shapes-low"></g>
  <g id="shapes-mid"></g>
  <g id="players"></g>
  <g id="balls"></g>
  <g id="shapes-high"></g>
  <g id="ghost"></g>
</svg>
```

`viewBox` uses **rink meters * 100** so all coordinates are physical, and export
resolution is a rendering choice, not a data one.

**Do NOT preallocate 500 player nodes.** That was a jQuery-era optimization.
Create/destroy on demand; modern browsers handle thousands of SVG nodes fine.

### 6.2 Drag/rotate (Pointer Events)

```js
// engine/interaction.js
export function makeDraggable(el, { onStart, onMove, onEnd, snap }) {
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    const start = svgPoint(e);
    const orig = { x: +el.dataset.x, y: +el.dataset.y };
    onStart?.(el);
    const move = ev => {
      const p = svgPoint(ev);
      let x = orig.x + (p.x - start.x);
      let y = orig.y + (p.y - start.y);
      if (snap) ({ x, y } = snap(x, y));
      el.setAttribute('transform',
        `translate(${x} ${y}) rotate(${+el.dataset.a || 0})`);
      el.dataset.x = x; el.dataset.y = y;
      onMove?.(el, { x, y });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      onEnd?.(el);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}
```

### 6.3 Undo/redo (missing on tactical-board, ship it)

```js
// engine/history.js
export class History {
  constructor(max = 100) { this.stack = []; this.i = -1; this.max = max; }
  push(state) {
    this.stack.length = this.i + 1;
    this.stack.push(structuredClone(state));
    if (this.stack.length > this.max) this.stack.shift(); else this.i++;
  }
  undo() { return this.i > 0 ? structuredClone(this.stack[--this.i]) : null; }
  redo() {
    return this.i < this.stack.length - 1
      ? structuredClone(this.stack[++this.i])
      : null;
  }
}
```

Push after `pointerup`, delete, style change, add/remove frame. Bind Ctrl+Z/Y.

### 6.4 Snap to face-off dots

```js
// engine/snap.js  (5 face-off dots in rink-coordinates)
const DOTS = [[650,350],[650,1050],[1300,700],[1950,350],[1950,1050]];
export function snapToDot(x, y, tol = 40) {
  for (const [dx, dy] of DOTS)
    if (Math.hypot(x - dx, y - dy) < tol) return { x: dx, y: dy };
  return { x, y };
}
```

### 6.5 Storage wrapper (`{value, expires}`, like tactical-board)

```js
// io/storage.js
const KEYS_INDEX = '__idx__';
export const store = {
  set(k, v, ttlMs = 0) {
    const rec = {
      value: JSON.stringify(v),
      expires: ttlMs ? Date.now() + ttlMs : 0,
    };
    localStorage.setItem(k, JSON.stringify(rec));
    const idx = JSON.parse(localStorage.getItem(KEYS_INDEX) || '{}');
    idx[k] = 1;
    localStorage.setItem(KEYS_INDEX, JSON.stringify(idx));
  },
  get(k) {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (r.expires && r.expires < Date.now()) {
      localStorage.removeItem(k);
      return null;
    }
    return JSON.parse(r.value);
  },
};
```

### 6.6 Animation playback (worker-driven timer + Bezier interp)

```js
// animation/player.js
export function runFrames(doc, {
  onFrameStep,
  onDone,
  loop = doc.animation.repeat,
  fps = 60,
  speed = doc.animation.speed,
}) {
  const stepsPerFrame = Math.round(60 / speed);
  let f = 1;
  let s = 0;
  const timer = new Worker(
    new URL('./timer-worker.js', import.meta.url), { type: 'module' });
  const nextTick = () => {
    const from = doc.animation.frames[f - 1];
    const to   = doc.animation.frames[f];
    const t = s / stepsPerFrame;
    for (const [id, cur] of Object.entries(to.elements)) {
      const prev = from.elements[id] ?? cur;
      const p = interp(prev.pos, cur.pos, t);
      applyTransform(id, p.x, p.y, lerp(prev.ang, cur.ang, t));
    }
    onFrameStep?.({ frameIndex: f, subStep: s, stepsPerFrame });
    if (++s > stepsPerFrame) {
      s = 0; f++;
      if (f >= doc.animation.frames.length) {
        if (loop) f = 1; else return onDone?.();
      }
    }
    timer.postMessage({ ms: 1000 / fps });
  };
  timer.onmessage = nextTick;
  timer.postMessage({ ms: 0 });
}

function interp(a, b, t) {
  if (b.im1 && b.im2) {                           // cubic Bezier
    const u = 1 - t;
    return {
      x: u*u*u*a.e.x + 3*u*u*t*b.im1.x + 3*u*t*t*b.im2.x + t*t*t*b.e.x,
      y: u*u*u*a.e.y + 3*u*u*t*b.im1.y + 3*u*t*t*b.im2.y + t*t*t*b.e.y,
    };
  }
  return { x: lerp(a.e.x, b.e.x, t), y: lerp(a.e.y, b.e.y, t) };
}
const lerp = (a, b, t) => a + (b - a) * t;
```

```js
// animation/timer-worker.js
onmessage = e => setTimeout(() => postMessage(0), e.data.ms);
```

Worker timer prevents `setTimeout` throttling in background tabs, critical during
MP4 capture.

### 6.7 Bezier curve editor

When a keyframe is added and the user grabs the mid-path handle on a player,
spawn two Bezier control points at 1/3 and 2/3 of the straight segment (same math
tactical-board uses):

```js
im1 = { x: s.x + (e.x - s.x)/3, y: s.y + (e.y - s.y)/3 };
im2 = { x: s.x + (e.x - s.x)/3*2, y: s.y + (e.y - s.y)/3*2 };
```

Render as draggable diamond handles; live-update `im1`/`im2`; redraw the SVG path
preview under the player.

### 6.8 PNG export

```js
// io/png.js
export async function schemeToPng(svgEl, { width = 1920, crop }) {
  await inlineImages(svgEl);                    // <image href> -> base64
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = await loadImage(url);
  const [w, h] = croppedSize(svgEl, crop, width);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, ...cropArgs(crop, svgEl), 0, 0, w, h);
  URL.revokeObjectURL(url);
  return await c.convertToBlob({ type: 'image/png' });
}
```

### 6.9 HTML self-contained animation export

Inline the doc + engine into a single file:

```html
<!doctype html><meta charset=utf-8><title>Tactic</title>
<style>/* board styles + engine styles */</style>
<div id=app></div>
<script id=doc type=application/json>{{DOC_JSON}}</script>
<script>{{ENGINE_JS_INLINED}}</script>
```

Truly offline. Better than tactical-board (theirs still calls back to the server).

### 6.10 MP4 export (client capture + server stitch)

**Client:**

```js
// animation/export.js
export async function exportMp4(doc, {
  fileWidth = 1920, startFrame = 1, endFrame,
}) {
  const build = await hashBuildToken({ doc, fileWidth, startFrame, endFrame });
  const job = crypto.randomUUID();

  const pre = await api(`/movie/precheck?build=${build}`);
  if (pre.exists) return pre;

  const svg = document.getElementById('board');
  let subStep = 0;
  const totalSteps = countSteps(doc, startFrame, endFrame);

  await new Promise((resolve, reject) => {
    runFrames(doc, {
      loop: false,
      onFrameStep: async ({ frameIndex, subStep: s }) => {
        const png = await schemeToPng(svg, { width: fileWidth, crop: doc.crop });
        const name = String(1e7 + 1e4 * frameIndex + s) + '.png';
        await api('/movie/upload', {
          method: 'POST',
          body: formData({ job, build, name, png }),
        });
        progress((++subStep / totalSteps) * 100);
      },
      onDone: resolve,
    });
  });

  return await api('/movie/finalize', {
    method: 'POST',
    body: { job, build, fps: 60, speed: doc.animation.speed },
  });
}
```

Deterministic `build` hash acts as server-side cache key: identical animations
re-exported hit the cache immediately.

**Server (Cloud Run + Node + ffmpeg):**

```js
// server/movie-maker/server.js
import express from 'express';
import multer from 'multer';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const JOBS = '/tmp/jobs';
const OUT = '/data/mp4';

app.get('/movie/precheck', async (req, res) => {
  const p = path.join(OUT, req.query.build + '.mp4');
  const exists = await fs.stat(p).then(() => true, () => false);
  res.json({ exists, file_url: `/mp4/${req.query.build}.mp4` });
});

app.post('/movie/upload', upload.single('png'), async (req, res) => {
  const dir = path.join(JOBS, req.body.job);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, req.body.name), req.file.buffer);
  res.json({ ok: true });
});

app.post('/movie/finalize', express.json(), async (req, res) => {
  const { job, build, fps } = req.body;
  const dir = path.join(JOBS, job);
  const out = path.join(OUT, build + '.mp4');
  execFileSync('ffmpeg', [
    '-y', '-framerate', String(fps),
    '-pattern_type', 'glob', '-i', `${dir}/*.png`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast', '-crf', '20',
    out,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
  res.json({ file_url: `/mp4/${build}.mp4`, iframe_url: `/embed/${build}` });
});
```

Filenames sort lexicographically thanks to the `1e7 + 1e4*frame + step` offset.

### 6.11 WebCodecs fast path (optional, Chromium-only)

If `'VideoEncoder' in window`, capture straight to a fragmented MP4 with
[`mp4-muxer`](https://www.npmjs.com/package/mp4-muxer) - no server round trip.
Falls back to the server path on Firefox/Safari.

---

## 7. UI layout

Match tactical-board's toolbar (users are familiar with it):

```
+------------------------------ canvas ------------------------------+
|                                                                    |
|  +---------- top bar ----------+          +--- right rail ------+  |
|  | share  png  crop  bookmark  |          | collection          |  |
|  | markup  animate  conference |          | language            |  |
|  +-----------------------------+          | help / PRO          |  |
|                                           +---------------------+  |
|                                                                    |
|  +-------- palette --------+   +---------- tools ------------+     |
|  | team1: 1..25            |   | pointer  line  curve  dash  |     |
|  | team2: 1..25            |   | color    undo  redo         |     |
|  | ball  stick  zone  text |   | delete   clear-all          |     |
|  +-------------------------+   +-----------------------------+     |
|                                                                    |
|  +--- frames strip (animation mode only) -----------------+        |
|  | [0] [1] [2] [+]                                        |        |
|  +--------------------------------------------------------+        |
+--------------------------------------------------------------------+
```

Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Delete, Space (play/pause), Left/Right (step
frames), 1..9 (speed).

---

## 8. Milestones

Each milestone is independently shippable.

### M1 - Static rink editor

- Rink SVG (vertical + horizontal), colored bg, correct markings.
- Palette of team 1/2 players (1..25), ball, stick.
- Drag + rotate + delete.
- Snap to face-off dots (tolerance 40 units in rink coords).
- Undo/redo (Ctrl+Z, Ctrl+Y).
- PNG export with configurable crop rectangle.
- **Acceptance:** place a team 1 player #10 at center dot, add ball, export
  1920 px PNG, save Doc JSON to localStorage.

### M2 - Shapes and layers

- Tools: arrow, dashed arrow, curved arrow (Bezier), zone (filled polygon),
  text, freehand.
- Layer picker: low / mid / high (matches tactical-board layer stack).
- Color palette, line width.
- Toggle rink markup on/off.
- **Acceptance:** draw a curved arrow from player A to player B, place text
  label, verify export includes them.

### M3 - Auth, share links, collection

- Cloudflare Worker + D1 schema (users, docs).
- Google OAuth -> JWT cookie.
- `POST /doc` returns short slug; `GET /doc/:id` loads.
- Personal collection page: list, rename, delete, duplicate.
- Free tier limits: 100 schemes, 100 animations; PRO: 1000/1000.
- **Acceptance:** anon user clicks Share, gets short URL; opens URL in incognito,
  sees the same board.

### M4 - Animation engine

- Frame model per section 5.1.
- Timeline UI strip (add/remove/select frame).
- Playback: play, pause, stop, step, repeat, speed 1..9.
- Bezier curve editor with draggable `im1`/`im2` handles.
- Per-element easing (linear / ease-in / ease-out / ease-in-out).
- Worker-driven timer to avoid tab throttling.
- **Acceptance:** 3-frame animation of a give-and-go: player 1 -> ball ->
  player 2 -> shot; curve arc looks right; loops smoothly.

### M5 - HTML self-contained export

- Rollup step that inlines engine JS + CSS + Doc JSON into one HTML file.
- No server calls at runtime.
- Under 100 KB gzipped.
- **Acceptance:** open exported file offline, animation plays.

### M6 - MP4 export

- Deterministic `build` hash on client.
- Cloud Run ffmpeg worker (Dockerfile + `server.js` from section 6.10).
- Client `/precheck` -> upload PNGs -> `/finalize`.
- Progress bar tied to `subStep / totalSteps`.
- Optional: WebCodecs fast path.
- **Acceptance:** export 3-frame animation to 1920 px 60 fps MP4, verify
  duration matches `frames * (60/speed) * (1/60)` s.

### M7 - i18n and PRO

- i18n JSON bundles for `de` + `en`, `Intl.NumberFormat` etc.
- Stripe Checkout page, webhook writes `pro_expires`.
- Watermark: SVG text baked into board pre-rasterize on free tier; removed for
  PRO before capture.
- PRO gating for MP4 export.
- **Acceptance:** switch to `de`, all UI text translated; free user cannot start
  MP4 export; PRO user has no watermark.

### M8 - Polish

- Keyboard shortcut sheet, touch/tablet gestures (two-finger rotate, pinch zoom).
- Mobile responsive layout (palette collapses into drawer).
- Onboarding tour (uses tactical-board's `shown_tips` pattern).
- Accessibility: keyboard-only editing, aria-labels on toolbar.

---

## 9. Things to explicitly do differently from tactical-board.com

1. **Undo/redo** - they don't have it; users complain.
2. **No preallocated 500-node DOM pool** - create on demand.
3. **Vite + ES modules, no core-js polyfills** - target evergreens.
4. **Client-side MP4 URL cache** - repeat downloads should skip the server round
   trip; store `{build_hash -> url}` in localStorage.
5. **WebCodecs fast path** on Chromium.
6. **Truly offline HTML export** (theirs still hits the server for asset URLs).
7. **Per-element easing** in animation frames (their engine only does linear
   position, cubic curves).
8. **Configurable rink dimensions** (small hall / regulation).
9. **Anti-alias face-off dots to sub-pixels**, no ugly sprite artifacts.
10. **Deterministic build hash includes locale** (watermark text differs).

---

## 10. Open questions to resolve before start

- Which auth provider first: Google OAuth only, or magic-link email?
- Which payment vendor: Stripe (recommended) vs Paddle?
- Where to host: Cloudflare (recommended, cheap) vs Vercel + Supabase?
- Should MP4 output include audio? (tactical-board strips audio; agreed.)
- Do we need player names/photos (roster import) or just numbered chips? MVP: numbers only.
- Localization scope: just `de` + `en`, or add `fr` / `it` for Swiss floorball market?

---

## 11. Reference URLs

- Live app to reverse-engineer: <https://tactical-board.com/uk/floorball-vertical>
- Their bundle (huge, obfuscated): `/static/js/1.js`
- Their sport markup script: `/static/js/board-markup-ov.js`
- Their animation URL pattern: `/<lang>/<sport>/animation`

---

## 12. Handoff prompt for next LLM session

> I want to build a floorball tactical-board web app. Use the plan in
> `docs/floorball-board-clone-plan.md` as the single source of truth. Start with
> milestone **M1**: scaffold a Vite project with vanilla JS modules, implement the
> vertical floorball rink SVG in `src/boards/floorball-v.js`, the scene layer
> stack, a draggable player element with snap-to-dot, undo/redo, and PNG export.
> Follow the directory layout in section 4 and the code snippets in section 6.
> Do not add any framework beyond Vite. Ship M1 as a working demo before moving
> to M2.
