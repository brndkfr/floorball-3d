# Floorball 3D - tactical board authoring plan

> Implementation plan for adding scheme + animation authoring to the existing
> `floorball-3d` viewer. Written as the single source of truth for future work
> on this feature. Draws inspiration from `floorball-board-clone-plan.md` (a
> reverse-engineering of tactical-board.com) but is a different product: 3D,
> static-site, no backend, no tiers.
>
> Follow-ups and deferred items live in `tactical-board-followups.md`.

---

## 0. TL;DR

Extend the existing three.js viewer with authoring on top of the same 3D rink:
drag player chips, draw arrows/zones/text, animate with keyframes, export MP4
client-side. Zero build tools, no backend, no accounts, all features free.

---

## 1. Guiding constraints

Non-negotiable properties inherited from this repo (see `CLAUDE.md`):

- **Static site, zero build.** ES modules loaded directly from `web/`,
  deployed by the existing GitHub Pages workflow. No Vite, no bundler.
- **No backend.** Everything client-side. Sharing via URL fragment.
- **No accounts, no PRO, no i18n framework, no watermark.** All features
  free, always. English UI ships first; more languages only on demand.
- **mm units, +Z forward, shared mutable `state`.** New code follows
  the coordinate and state conventions already documented.
- **Assets stay generator-driven.** Static geometry via a `generate_*.py`
  script that writes into `web/assets/`. Dynamic geometry (arrows drawn
  by the user) built in JS at runtime.
- **Rink-accurate.** Authoring happens on the same IFF-spec rink the
  viewer already renders. Coverage, trajectories, goalie all work
  during playback for free.

---

## 2. Scope

### In scope (MVP)

- **Player chips**: two teams, numbered, draggable on the rink plane.
- **Ball & goalie**: reuse the existing objects as first-class scene
  elements (already in the shared `state`).
- **Shapes**: arrow, dashed arrow, curved arrow, filled zone, text label,
  freehand. Rendered flat on the rink at Y=0.
- **Undo / redo** (Ctrl+Z / Ctrl+Y), snapshot-based.
- **Two-mode camera**: orthographic top-down for authoring, existing
  perspective first-person for playback / free-look.
- **Keyframe animation**: linear + cubic-Bezier paths, per-element
  angle, timeline strip with scroll + wheel zoom.
- **Optional per-frame camera keyframes** (cinematic playback).
- **Export**: PNG (frame), MP4 (WebCodecs), WebM (MediaRecorder
  fallback), GIF (opt-in for short clips), JSON (doc), share URL.
- **Persistence**: localStorage (current + named slots, unlimited),
  JSON import/export, URL-fragment share.
- **Touch / tablet controls** for authoring.

### Explicitly out of scope

- Server-side anything (auth, storage, MP4 encoding, share pastebin).
- PRO tier, payments, watermark, gating.
- Full i18n framework beyond English strings in one JSON file.
- Split-view (top-down + perspective simultaneously). See follow-ups.
- Roster / player-name import. See follow-ups.
- Voiceover / audio track. See follow-ups.

---

## 3. Architecture

### 3.1 File layout (added under `web/src/`)

```
web/src/
  authoring/
    doc.js                 # Doc / Scene / Frame data model + defaults
    history.js             # undo/redo snapshot stack (~150 LOC)
    palette.js             # dock: chip stamp, shape tools, play, overflow menu (§3.7)
    chips.js               # player chip factory + drag / rotate / delete
    shapes.js              # arrow / zone / text / freehand geometries
    draw-mode.js           # top-down camera swap + click-to-place tools
    snap.js                # snap-to-face-off-dot in (x, z)
    storage.js             # localStorage slots + URL-fragment share
  animation/
    model.js               # Frame CRUD, per-element interpolation
    timeline.js            # scrollable + zoomable frame strip UI
    playback.js            # runFrames(): worker timer + Bezier interp
    timer-worker.js        # setTimeout in a Worker (no tab throttling)
    camera-keys.js         # optional per-frame camera pose
  export/
    png.js                 # single-frame PNG
    mp4.js                 # WebCodecs VideoEncoder + mp4-muxer
    webm.js                # MediaRecorder fallback
    gif.js                 # opt-in short clips
    share-url.js           # doc <-> URL fragment (deflate + base64)
```

Existing modules (`state.js`, `scene.js`, `controls.js`, `coverage.js`,
`trajectory.js`, `goalie.js`, `hud.js`, `selection.js`, ...) are
**extended, not replaced**. New authoring state lives on the shared
`state` object per the convention in `CLAUDE.md`.

### 3.2 Data model

Portable JSON. Same shape as the reference plan, but coordinates are mm
on the rink plane and angles are Y-axis rotations.

```ts
type Doc = {
  version: 1;
  bg?: string;                              // optional background override
  hideMarkup: boolean;                      // hide rink lines during export
  scheme: Scene;                            // frame 0 of any animation
  animation?: {
    speed: number;                          // 1..9, drives sub-steps per frame
    repeat: boolean;
    frames: Frame[];                        // frames[0] === scheme snapshot
  };
};

type Scene = {
  players: Record<Id, Player>;
  balls: Record<Id, Ball>;
  goalie?: { x: number; z: number; angle: number; kind: 'simple'|'detailed' };
  shapes: Shape[];
  camera?: CameraPose;                      // saved viewpoint for scheme
};

type Player = { id: Id; team: 1|2; number: string; x: number; z: number; angle: number };
type Ball   = { id: Id; x: number; z: number };
type CameraPose = { x: number; y: number; z: number; yaw: number; pitch: number };

type Shape =
  | { id: Id; type: 'arrow'|'dashed'|'curve'; layer: 'low'|'mid'|'high';
      color: string; width: number; points: [number, number][] }
  | { id: Id; type: 'zone'; layer: 'low';
      color: string; opacity: number; points: [number, number][] }
  | { id: Id; type: 'text'; layer: 'high';
      x: number; z: number; text: string; color: string; size: number }
  | { id: Id; type: 'freehand'; layer: 'high';
      color: string; width: number; points: [number, number][] };

type Frame = {
  elements: Record<Id, {
    pos: {
      s: { x: number; z: number };          // start
      e: { x: number; z: number };          // end
      im1?: { x: number; z: number };       // Bezier control 1
      im2?: { x: number; z: number };       // Bezier control 2
    };
    ang: number;
    ease?: 'linear'|'ease-in'|'ease-out'|'ease-in-out';
  }>;
  camera?: CameraPose;                      // optional per-frame camera
  shapes?: Shape[];                         // shapes visible only this frame
};
```

### 3.3 Rendering: shapes on the rink

- Arrow / dashed / curved / freehand -> `TubeGeometry` along a
  `CatmullRomCurve3` at Y=0, thickness = `width * SCALE`. Dashed
  variant uses a dash-shader material or short repeated tubes.
- Zone -> `ShapeGeometry` (2D polygon) at Y=0.5 mm to avoid z-fighting
  with the rink surface. `renderOrder` set by `layer`.
- Text -> `Sprite` with a canvas-generated texture, always faces the
  camera.
- Player chip -> generated `.obj/.mtl` disc (~200 mm dia, ~20 mm tall)
  with a child sprite for the number. Team color via material.

### 3.4 Cameras

- Existing perspective first-person camera stays untouched.
- New `OrthographicCamera` looking straight down (Y+ -> Y-) covering
  the full rink, used only in author mode and during "top-down" playback.
- `draw-mode.js` toggles between them; the current camera reference on
  `state` is what `scene.js` renders each frame.
- Playback uses whichever camera is active; if `Frame.camera` is set,
  it interpolates a perspective pose between keyframes.

### 3.5 Selection & interaction

- Extend the existing `selection.js` to accept chip / shape / handle
  types alongside the current ball/goalie selection.
- Drag on the rink plane: raycast against an invisible ground plane at
  Y=0, snap-to-dot per `snap.js`.
- Rotate: existing rotate control on `selected` object. Chips have an
  `angle` even though they're round, so the number sprite orientation
  matches player facing.

### 3.6 State & undo

- All authoring state on the shared `state` object: `state.doc`,
  `state.currentFrame`, `state.selected`, `state.activeTool`,
  `state.history`. There is deliberately **no `state.mode`** - see
  §3.7 for why authoring is expressed as actions, not modes.
- `history.push()` after every `pointerup`, delete, shape complete,
  frame add/remove. Max 100 snapshots via `structuredClone`.
- Snapshots are the `Doc` object (small - the whole scene JSON is
  well under a MB for realistic scenes), not diffs. Simpler, fast enough.

### 3.7 UI & interaction design

The existing viewer is analytical - cyan-on-black tactical HUD, dense
numeric readouts, precise. Authoring must feel different: forgiving,
playful, low-cognitive-load. Reusing the same HUD-panel language for
chip palettes and file operations would produce a flight-sim cockpit.

Guiding principles:

- **Direct manipulation over mode switching.** The rink is always the
  primary object. Picking a tool is an action, not a mode. Users never
  ask *"which mode am I in?"*.
- **One dock, not many panels.** All authoring affordances live in a
  single bottom-center dock. The existing analytical HUD panels stay
  where they are, unchanged.
- **Progressive disclosure.** Beginner sees the three things that
  matter. Advanced options hide one interaction deep (long-press for
  arrow variants, overflow menu for file ops).
- **Contextual property editing.** Select an arrow -> a small floating
  property chip appears next to it. Select nothing -> no property UI
  visible. Nothing competes for attention when it isn't needed.
- **Undo is the trampoline.** Rock-solid Ctrl+Z (and a visible undo
  button in the dock overflow) means users try things instead of
  reading docs. No confirmation dialogs, ever.
- **Delight in micro-interactions.** Chips settle with a subtle bounce
  on drop. Face-off dots pulse when a chip approaches. Ghost previews
  follow the cursor before commit. Cheap to build, defining for feel.
- **Preserve the analytical viewer.** Coverage %, trajectory colors,
  goal outline - unchanged. Authoring is *added*, not overlaid on top.

Concrete surfaces:

1. **The Dock** (bottom-center, always visible).
   Left-to-right, ordered by frequency of use:
   - **Chip stamp** - one button (not 20). Click to activate; each
     click on the rink drops the next available number for the current
     team. Long-press / secondary tap flips team color. Small badge
     shows next number.
   - **Ball** / **Goalie** toggles - single-instance world objects.
     Drag from the dock icon to reposition.
   - **Shape tools** - arrow, zone, text. Dashed / curved arrow
     variants live inside the arrow tool (long-press to reveal).
     Freehand hides in the overflow menu until asked for.
   - **Play** button - single icon. Press to play from current frame.
     If no animation exists yet, it prompts *"Add a keyframe first?"*
     inline (no modal).
   - **Add keyframe** - the way animation is born. First press
     promotes the current scheme into `frames[0]`, adds `frames[1]`
     as an editable copy, and the timeline strip fades in.
   - **Overflow menu** (`...`) - New / Save / Load / Share URL /
     Export... / Undo / Redo / Settings. No always-visible file panel.

2. **Contextual property chips** (float near selection).
   - Select an arrow -> small floating chip with color / width / delete.
   - Select a player chip -> team + number editable.
   - Select a keyframe on the timeline -> speed / easing for that step.
   - Vanish on deselect. Positioned to avoid covering the selection
     and to stay within the viewport.

3. **Timeline strip** (bottom, above the dock).
   - **Hidden entirely** until `frames.length > 1`. Static-scheme users
     never see it.
   - Fades in with the first added keyframe. Frame cards scroll
     horizontally, wheel zooms card width.
   - Playback controls (scrub, speed, loop) live in the strip, not the
     dock, so the dock stays the same size regardless of animation.

4. **Camera behaviour** (no mode switcher).
   - Pick a shape/chip tool -> camera auto-swings (300 ms ease) to
     orthographic top-down.
   - Press Play -> playback runs on whichever camera the frames
     specify, or holds current.
   - Drag the empty rink -> orbit / free-look with the existing
     perspective camera.
   - Users experience these as *things they do*, not *places they go*.

5. **Status line** (bottom of viewport, above the dock).
   Single line of context text: *"arrow tool - click to place endpoints,
   esc to cancel"*. Replaces the current `#status` element's role during
   authoring; falls back to the current numeric readout when no tool is
   active. Krug's "billboard on the highway" principle.

6. **Existing analytical HUD** (unchanged).
   `#info`, `#coords`, `#layers`, coverage / trajectory readouts, goalie
   label, crosshair - all identical to today. A user who only came for
   the viewer sees almost nothing new until they touch the dock.

7. **Export dialog** (modal, only during export).
   The only modal in the app. Justified because encoding is a genuinely
   blocking operation with cancel semantics. Everything else is inline.

8. **Touch layout**.
   Dock stays bottom-center, sized larger (min 44 px targets). Long-press
   replaced by 200 ms hold + released-menu. Contextual property chips
   dock to screen edges on narrow layouts instead of floating near
   selection (avoids fat-finger occlusion).

Micro-interactions worth building explicitly (each is ~half a day):

- **Drop with weight** - chips ease in over 100 ms with a subtle cyan
  ring flash on the rink at landing point.
- **Snap that talks back** - face-off dot glows on hover-approach, chip
  clicks into place with an optional soft tick (mutable, off by default).
- **Ghosted future** - during authoring, upcoming keyframe positions
  render as ghosted silhouettes. The play is visible as you build it.
- **Live-scrubbing** - dragging a chip's position at frame N updates
  the ghosted trajectory arcs in real time.
- **Hover preview for shapes** - a ghost arrow / zone follows the
  cursor before commit. What-you-see-is-what-you-get, always.

Explicit trade-offs accepted for MVP:

- **Long-press for arrow variants** is not perfectly discoverable.
  Mitigated by a tooltip on first hover. If usage data shows dashed /
  curved arrows are used rarely, keep them buried; if often, promote
  them to first-class dock buttons.
- **Single-instance ball / goalie** implicitly forbids multi-ball
  scenes. Documented in `tactical-board-followups.md`.
- **No visible mode indicator** trusts cursor changes + status line
  to communicate current tool. If users report getting lost, add a
  tool-name pill next to the cursor.

---

## 4. Milestones

Each is independently shippable. Ordering is deliberate: earlier
milestones stand alone as useful features even if later ones never ship.

### A1 - Player chips + drag on the 3D rink

- `generate_player_chip.py` writing `player_chip.obj/.mtl`.
- **Dock** (per §3.7) with the chip stamp button, team-color flip,
  Ball / Goalie toggles, and overflow menu (New / Undo / Redo /
  Settings). Shape tools + Play + Add-keyframe stubs disabled until
  their milestones ship.
- Chip stamp: click on the rink drops the next available number for
  the active team. Selected chip drags on the ground plane; `Del`
  removes it. Drop micro-interaction (ease + ring flash) shipped here.
- Persist `state.doc.scheme` to `localStorage` on every change; reload
  on page open.

**Acceptance:** spawn a 5v5 in under 30 seconds without reading any
docs, drag them around, delete one, refresh the browser, the same
scene reloads. First-person camera still works, coverage / trajectory
overlays still work.

### A2 - Shape tools + top-down camera

- Activate a shape tool from the dock -> camera eases into orthographic
  top-down, first-person walk controls suspend. Deactivating (Esc, or
  clicking the tool again) restores the previous camera.
- Tools: arrow (with dashed / curved variants revealed by long-press),
  zone, text. Freehand in the overflow menu.
- Click-to-place-points for arrow / curve / zone; second click ends,
  Esc cancels. Text opens an inline `<input>` at click location, not
  a modal.
- **Hover preview**: ghost shape follows cursor before commit.
- **Contextual property chip** (per §3.7) for the selected shape:
  color, width, layer (low / mid / high), delete. Vanishes on
  deselect.
- Layer stack rendered as three `Group`s added to scene in order.
- Undo/redo already usable via A1's history stack.
- Status line reflects active tool.

**Acceptance:** draw a give-and-go with two curved arrows and a
labeled zone; every shape has a hover preview before commit; exit the
tool; shapes lie correctly on the rink from the first-person camera
too. No always-visible "tools panel" anywhere on screen.

### A3 - Doc I/O + share URL

- Save/load: `state.doc` <-> named localStorage slots (unlimited) and
  downloadable `.json` files.
- Share URL: `#doc=<base64url(deflate(json))>`. Load on page open;
  copy-to-clipboard button. Use `CompressionStream('deflate-raw')`
  (native, no dependency) to keep the fragment small.
- **URL-fragment share is capacity-limited** (~32 KB in most browsers).
  If encoding exceeds the limit, the copy button falls back to a JSON
  download with a message. See `tactical-board-followups.md` for the
  paste-bin option if this ever becomes a real problem.

**Acceptance:** author a scene, copy share URL, open in incognito,
identical scene loads. Scenes too large fall back to JSON download.

### A4 - Keyframe animation

- Frame model per section 3.2. `frames[0]` is always the current scheme.
- Timeline UI at the bottom of the screen:
  - Horizontal strip of frame cards, **scrolls horizontally**, wheel
    zooms in/out (each card is 40-120 px wide depending on zoom).
  - Buttons per frame: select / duplicate / delete / insert-before /
    insert-after.
  - "Add frame" appends a copy of the current scene as a new keyframe.
- Playback: play / pause / stop / step-forward / step-back / speed 1..9
  / loop toggle. Bound to Space / Left / Right / 1..9 / R.
- Interpolation MVP: linear position, linear angle. Bezier in A5.
- Worker-driven timer (`animation/timer-worker.js`) so playback and
  future recording don't get throttled by tab visibility.
- Ball position drives coverage / trajectory overlays automatically -
  they already read `state.ballGroup` each frame.

**Acceptance:** 10-frame animation, chips glide between positions,
loops smoothly, timeline scrolls on a small screen, existing overlays
update in sync during playback.

### A5 - Curved paths + camera keyframes

- Bezier `im1` / `im2` per element per frame. When the user grabs the
  mid-path handle on a chip in author mode, spawn two draggable
  control-point spheres at 1/3 and 2/3 of the straight segment (same
  math as the reference plan). Drag to shape the arc.
- Live path preview: dashed line on the rink between selected chip
  positions across visible frames.
- Optional per-frame camera pose:
  - "Set camera to current view" button per frame. If unset, the
    camera stays put during that frame's interpolation.
  - During playback, camera pose lerps between frames that have one
    set (skipping frames that don't).

**Acceptance:** authored give-and-go plays with a smoothly arcing pass
and a camera that swings behind the shooter for the finish.

### A6 - Export

- **Detect capability at export time**, not at boot:
  - MP4 if `'VideoEncoder' in window` and the MP4 codec probe succeeds.
  - WebM if `MediaRecorder.isTypeSupported('video/webm;codecs=vp9')`.
  - PNG / GIF / JSON / share-URL always available.
- Export dialog:
  - **Format**: MP4 (default when supported) / WebM / GIF (short clips
    only, warning shown) / PNG (current frame) / JSON / Share URL.
  - **Resolution**: 720p / 1080p / 1440p / 2160p. Default 1080p on
    desktop, 720p on `pointer: coarse` (touch) devices.
  - **FPS**: 30 or 60. Default 60 on desktop, 30 on touch.
  - **Range**: whole animation or current frame only.
  - Progress bar tied to `encodedFrames / totalFrames`, cancel button.
- **MP4 pipeline** (WebCodecs + `mp4-muxer` via `esm.sh`, keeps the
  zero-build story):
  1. Off-screen resize renderer to target resolution; save original.
  2. Set up `VideoEncoder({ codec: 'avc1.42E01F', bitrate: ... })`
     and an `Mp4Muxer` writing to an in-memory `ArrayBuffer`.
  3. Drive the animation via `runFrames({ timerMethod: 'worker' })` at
     max speed. Per sub-step:
     - `renderer.render(scene, activeCamera)`.
     - `const bitmap = await createImageBitmap(renderer.domElement);`
     - `encoder.encode(new VideoFrame(bitmap, { timestamp }))`.
     - `bitmap.close()`.
  4. `await encoder.flush(); muxer.finalize();` -> `Blob` -> download.
  5. Restore original renderer size + camera.
- **WebM fallback**: `canvas.captureStream(fps)` + `MediaRecorder`,
  same driving loop, different sink.
- **GIF**: `gif.js` in a Worker. Only offered for animations <= 3 s at
  <= 720p, with an explicit "large file, low quality" warning. See
  follow-ups for a better encoder later.

**Acceptance:** author a ~5 s give-and-go, click Export -> MP4 1080p
60fps, get a ~2-5 MB `.mp4` that plays in QuickTime / VLC / WhatsApp /
Twitter without transcoding. On a browser without `VideoEncoder`, the
same button produces a WebM instead, with the format shown in the
dialog.

### A7 - Touch + polish

- Extend the existing `touch-controls.js`: tap to select, drag to move,
  two-finger to rotate, pinch to zoom the top-down camera.
- Palette collapses into a drawer on narrow / touch layouts.
- Keyboard shortcut help overlay (`?` key).
- Snap-to-face-off-dot enabled by default, toggleable in HUD.
- Onboarding tip on first visit ("drag a chip from the palette to
  start"), dismiss-once via `localStorage`.

**Acceptance:** author and export a simple animation entirely on a
tablet without a keyboard.

---

## 5. Dependencies

Only what can be loaded as ESM from a CDN, to preserve the zero-build
property. Pinned versions committed to `index.html`.

| Purpose | Choice | How loaded |
|---|---|---|
| Deflate for share URL | `CompressionStream('deflate-raw')` | Native, no dep |
| MP4 muxing | `mp4-muxer` | `import ... from 'https://esm.sh/mp4-muxer@<pinned>'` |
| GIF encoding (opt-in) | `gif.js` | Same pattern; Worker-based |

three.js itself is already loaded this way in the existing app. No new
bundler, no `package.json`, no build step.

---

## 6. Deferred / follow-ups

Everything not in section 2 "in scope" lives in
`tactical-board-followups.md`. Highlights:

- Split-view (top-down + perspective simultaneously).
- Frame thumbnails on the timeline.
- Per-element timeline tracks.
- Better GIF encoder (`gifski` WASM).
- Server-side render fallback for browsers without any client encoder.
- Roster / player-name import.
- Voiceover / audio track.
- Tiny paste-bin backend if URL-fragment sharing hits its limit often.
- Extracting rink dimensions into a single `rink-spec.json` consumed
  by both the Python generators and the JS runtime (technical debt
  already flagged in `CLAUDE.md`).

---

## 7. Handoff prompt for next session

> Extend the `floorball-3d` viewer with tactical-board authoring per
> `docs/floorball-3d-authoring-plan.md`. Start with milestone **A1**:
> add a `generate_player_chip.py` script, wire the bottom-center Dock
> (§3.7) with the chip stamp button, ball / goalie toggles, and the
> overflow menu; implement drop / drag / delete for chips on the rink
> plane; persist to `localStorage`. Follow the constraints in section 1,
> the file layout in §3.1, and the UI principles in §3.7 (one dock, no
> modes, contextual properties, delightful micro-interactions). Do not
> add a bundler or a backend. Ship A1 as a working demo before moving on.
