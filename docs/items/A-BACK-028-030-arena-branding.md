# A-BACK-028 to A-BACK-030 - Arena branding

Status: open, parked (see [plan.md](../plan.md) "Later"). Build after
S-BACK-024 so the new project-level `doc.arena` state does not add another
mesh-to-doc write-back path.

Spec as agreed (moved unchanged from the old plan, 2026-10-15):

- **Arena branding (A-BACK-028 to A-BACK-030).** Team crest / sponsor
  logos on the floor and ads on the boards, project-wide (not per
  frame). Order: 028 (no dependencies), then 029, then 030 (needs both).
- **[A-BACK-028]** [open] **Board slots with toggleable labels.** The
  straight board runs split into 2 m slots (board height 500 mm):
  long sides 40 m - 2 x 2 m corner radius = 36 m = 18 slots each, ends
  20 m - 4 m = 16 m = 8 slots each, 52 in total. The four 2 m-radius
  corners stay unlabelled.
  - Pure `boardSlots()` (three-free, next to the rink constants): per
    slot `{ id, side, index, start, end, normal }` in world mm, derived
    from `RINK_L` / `RINK_W` / corner radius, so nothing in
    `generators/` or `web/assets/` changes.
  - Naming (default, confirm before building): per side, `L1-L18` and
    `R1-R18` counted from goal A towards goal B (left / right as seen
    from goal A looking at B), `A1-A8` and `B1-B8` along the ends.
    Alternative: one run 1-52 clockwise.
  - Label: canvas-textured plane on the inner board face near the top
    edge (readable in 3D, leaves room for an ad). Top-down sees the
    boards edge-on, so there the label lies flat on the floor just
    inside the board. Same floor-label technique as shapes.js.
  - Toggle: "Board labels" checkbox in the Layers panel next to
    "Goalie A" / "Goalie B", off by default, display-only (not stored
    in the doc).
  - Tests: node tests for `boardSlots()` (count 52, first / last slot
    ends, slot width 2000, normals point into the rink, no overlap with
    the corner arcs); e2e: toggle shows / hides all 52 labels.
- **[A-BACK-029]** [open] **Floor logo + shared image store.** One or
  more images lying on the floor (centre-court crest, sponsor logo).
  - Doc: project-level `doc.arena = { floor: [{ id, imageId, x, z, w,
    rotation, opacity }], boards: {} }`, outside `frames`, so it is the
    same in every frame. `ensureDoc()` / `acceptDoc()` default it.
  - Images live in IndexedDB (like `photo-cache.js`), keyed by a
    content hash so the same logo used many times is stored once; the
    doc only holds `imageId`. Keeps localStorage (~5 MB quota) and
    share links (32 KB `HASH_LIMIT`) small.
  - Image formats:
    - Accept PNG, JPEG, WebP and SVG. SVG is rasterized on import via
      `<img>` -> canvas, never inserted into the DOM (no script
      injection). JPEG has no alpha, so a JPEG logo keeps its box.
    - Store as WebP with alpha: `canvas.toBlob('image/webp', 0.9)`.
      Browsers that can't encode WebP return PNG from `toBlob`, so
      store `blob.type` as-is, no special case.
    - Size on import, fit without stretching: floor logo longest side
      <= 1024 px; board ad 1024 x 256 (the 4:1 board slot), centred.
  - Render: textured plane ~2 mm above the floor, `polygonOffset`,
    `frustumCulled = false`, anisotropy set (CLAUDE.md rendering
    gotchas), `texture.colorSpace = THREE.SRGBColorSpace` (otherwise
    logos look washed out). A 1024^2 texture is ~5 MB of GPU memory
    decoded, so one texture per distinct image, shared by all its
    uses. Move + corner resize reuse the shape handles; rotation
    and opacity in the Inspector.
  - Known gap: a share link carries only `imageId`s, so the receiver
    sees no image. Bundling images into the file export is a possible
    follow-up.
  - Tests: node tests for the arena doc defaults / migration and the
    image-id hashing; e2e: import an image, place and resize it, reload
    and it is still there.
- **[A-BACK-030]** [open] **Board ads.** Depends on A-BACK-028 (slots)
  and A-BACK-029 (image store). `doc.arena.boards = { L7: imageId, ...
  }`; each assigned slot gets a 2000 x 500 mm textured plane just in
  front of the inner board face.
  - UI: an "Arena" section: upload logos, click one or more board
    slots to assign the chosen logo, quick fills ("all boards",
    "alternate A/B"), clear. Board ads use the 1024 x 256 import size
    from A-BACK-029, with an optional background colour for the bars
    beside a logo that isn't 4:1 (real board ads fill the panel).
  - Open: inner face only (enough for a playing-view camera) or the
    outer face too.
  - Tests: node test for assignment / quick-fill helpers; e2e: assign a
    logo to a slot, it renders there and survives a reload.
