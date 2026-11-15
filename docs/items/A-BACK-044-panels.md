# A-BACK-044 - Collapsible panels and Present mode

Status: in progress (steps 1 to 3 done 2026-11-15). Drafted
2026-11-14, agreed 2026-11-15 (options A and C of
the clickable draft:
<https://claude.ai/artifact/9tRBKZfgafPBVFjEapqkPh>). Keeps
[decisions/002](../decisions/002-broadcast-direction.md): the panel
stays a docked column at >= 1200 px, a drawer from 768 to 1199 px and
a bottom sheet on phones. Nothing here changes the layout below 1200 px.

Step tags: `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md): failing test first,
then the code, then `pnpm test`, the affected e2e specs, build and
size check.

## What is wrong now

- At >= 1200 px the right panel (`#rightPanel`, Inspector, Layers,
  View, Coordinates) is always open at 320 px (`--right-panel` in
  `app.css`). On a 1440 px screen that is 22 % of the width, also
  while nobody looks at it.
- Only Layers (`.lp-toggle`) and Coordinates (`.hud-toggle`) fold;
  Inspector and View do not, and View is long.
- The scene recorder (`#timeline`) always shows its segment strip,
  even when only play / pause is needed.
- Showing a play to the team means looking past rail, panel, palette,
  dock and timeline. That is the moment the plan's goal ("play it back
  to the team") is about.

## Design

**A - Collapse** (a layout state, remembered per browser):
- The side panel has two states, `open` (320 px) and `strip` (40 px of
  section icons: Inspector, Layers, View, Coordinates). Toggle with the
  top bar's panel button (today shown only below 1200 px) and the `\`
  key (free in `keymap.js`; proposal). An icon opens the panel at that
  section.
- Every section folds with the same header control; the fold state is
  remembered.
- The timeline folds to its transport bar (row 1); the strip and ruler
  hide.

**C - Present** (a temporary mode, not saved):
- "Present" in the top bar hides rail, top bar, panel, tool palette,
  dock, dock status and timeline, shows a small floating transport
  (play / pause, time, Exit) and starts playback.
- `Esc` or Exit leaves and restores the layout exactly as it was.
  Editing is off while presenting (no tool, no selection).

Both change only shell insets. The 2D fit (`fitTopDownFrustum`) and the
untouched 3D default view (`refitDefaultView`) already read them through
`ui/stage-frustum.js` `readShellInsets()`; `timeline.js` `syncInset()`
already re-fits when the recorder's height changes. The side panel needs
the same hook.

Not planned: **B - Float** (sections as floating cards). It brings back
the floating HUD panels that decision 002 replaced, the cards cover
chips and the fit cannot account for them. Revisit only for the
Inspector, and only after living with A and C.

## Open questions (defaults used until the user decides)

- Panel key: `\` (default) or another key.
- A chip click while the panel is a strip: the Inspector does **not**
  open by itself (default); the strip icon shows a dot instead.
- Present starts playback from frame 1 (default) or from the playhead.

## Steps

1. `[done 2026-11-15]` **Panel state math, no UI change.** As built:
   `parsePanelState`, `togglePanel`, `toggleFold`, `toggleTimeline`,
   `openAt`, `SECTIONS`, `PRESENT_HIDES`, `PANEL_STRIP_PX`; the
   inset itself stays in CSS (`html.panel-strip { --right-panel:
   40px }`), which `readShellInsets()` already reads. Original text: Pure
   `web/src/ui/panel-layout.js`: `panelInsets({ panel, width })` ->
   `{ right }` (320 open, 40 strip, 0 below 1200 px),
   `parsePanelState(stored)` (bad or missing -> defaults, as
   `palette-position.js` `parseStoredPos` does) and
   `presentHides` (the list of shell roots Present hides). Node test
   `test/panel-layout.test.js` first.
2. `[done 2026-11-15]` **Collapse the side panel to an icon strip.** As
   built: `web/src/ui/panels.js` owns the top bar panel button (moved
   out of `topbar.js`): drawer below 1200 px as before, strip at >=
   1200 px, hidden in Analyze there; `#panelStrip` in `index.html`;
   state in `localStorage` `floorball3d.panels`; the re-fit is a direct
   `fitTopDownFrustum()` + `refitDefaultView()` after each change, no
   observer needed. `right-panel.spec.js` now expects the button at
   >= 1200 px. Tests: `test-e2e/panels.spec.js`. Found on the way: the
   hall floor covering the rink on a real GPU, fixed separately
   (S-BACK-030). Original text: e2e first,
   `test-e2e/panels.spec.js`: at 1440 x 900 the panel button collapses
   the panel; the 2D rink box gets wider; the untouched 3D default view
   re-fits; a strip icon opens the panel at that section; a reload
   keeps the state; `\` toggles. Then: `body.panel-strip` class sets
   `--right-panel: 40px`; a `ResizeObserver` on `#rightPanel` (as
   `timeline.js` `syncInset()`) calls `fitTopDownFrustum()` and
   `refitDefaultView()`; show the top bar's panel button at >= 1200 px
   too; state in `localStorage` with try / catch. Keep the drawer
   behaviour below 1200 px unchanged (`phone.spec.js` must stay green).
3. `[done 2026-11-15]` **Fold every section and the timeline.** As
   built: `ui/panels.js` adds one `.rp-fold` button to each section's
   header (its first child) and `#timeline [data-action="fold-timeline"]`
   folds the recorder (`#timeline.folded` hides `.tl-strip`;
   `syncInset()` re-fits). The Layers `.lp-toggle` (and its
   `floorball3d.layersPanel.collapsed` key, read once to migrate) and
   the Coordinates `.hud-toggle` with `hud.js` are gone. Note: at
   1440 x 900 the 2D fit is width-bound, so folding the recorder gives
   the stage height and re-centres the rink rather than enlarging it.
   Original text: One fold control
   per section header, replacing `.lp-toggle` and the Coordinates
   `.hud-toggle` (`hud.js`); fold state remembered. Timeline: a fold
   button in `.tl-bar` hides `.tl-strip`; `syncInset()` already re-fits.
   e2e: fold View and the timeline, reload, both still folded; the 2D
   rink box gets taller when the timeline folds.
4. `[small]` **Present mode.** e2e first: Present hides every shell
   root in `presentHides`, the stage is the full window (3D default
   view fits it), playback runs (drive it with `seekTo`, rAF is paused
   in Playwright), `Esc` restores panel, fold and timeline state and
   the previous camera. Then: `body.presenting` class in `app.css`, a
   small transport element, `keymap.js` entry, Esc handled before the
   existing Esc (deselect / cancel tool) while presenting. Check
   `a11y.spec.js` (focus moves to the transport, back on exit).
5. `[lead]` **Look and feel check.** Screenshots at 1440 x 900 and
   1280 x 800 in all states (open, strip, folded timeline, Present),
   compared by eye with the draft; the user checks Present on the
   projector or TV used for team talks.

## Done when

At >= 1200 px the coach can give the rink the whole width but 40 px
with one key, fold whatever they do not need, and show a play to the
team with nothing but the rink and a small transport on screen, then
return to the exact layout with `Esc`.
