# S-BACK-021 - Broadcast redesign port

Status: open, moved up to "Next" on 2026-10-28 so the scene recorder
redesign (A-BACK-038, Variant A) lands in the Broadcast layout. Decisions behind it: [decisions/001](../decisions/001-web-awesome.md)
(Web Awesome) and [decisions/002](../decisions/002-broadcast-direction.md)
(Broadcast direction). Shipped groundwork: S-BACK-019 (tokens + theme
mapping, no visible change) and S-BACK-020 (design canvas gap-fill), see
[archive/plan-2026-10.md](../archive/plan-2026-10.md).

## Step 0 (deferred from S-BACK-019)

- Vendor the used Web Awesome subset into `web/lib/webawesome/` with its
  own budget entry in `scripts/check-size.mjs` and a local icon library.
  CodeQL is ready: advanced setup (`.github/workflows/codeql.yml`) with
  `.github/codeql/codeql-config.yml` ignoring `web/lib/webawesome`.
- Self-host Archivo + IBM Plex Mono woff2 under `web/lib/fonts/`.
- Per-theme domain colours and the HUD recolour onto `--fb-*`.

## Port order

Then, lowest risk / most visible first:
app shell (rail, top bar) -> right panel (Inspector / Layers as
`wa-tab-group`) -> tool palette + flyouts -> timeline -> dialogs
(export, share, library -> Library view) -> Analyze stepper + align
comparison + insights -> first run -> tablet drawer -> phone bottom
sheet / tab bar. Each surface: extend its e2e spec first, keep
existing DOM ids, keep module logic unchanged (only markup + CSS +
mount points), then `pnpm test:e2e:affected` + build + size.

## Design system reference (moved unchanged from the old plan section 2)

### Design system

**Decision (2026-09-24): Web Awesome (free, MIT) for interactive
components + our own CSS for tokens, theme and layout.** Supersedes the
earlier Open Props + Shoelace + Radix Colors plan:

- **Shoelace** is end-of-life: last release 2.20.1 (2025-03-11), repo
  archived 2026-05-14. Its successor is **Web Awesome**
  (`@awesome.me/webawesome`, by the Font Awesome team; 3.14.0 on
  2026-09-24 when checked). The free core is MIT, same zero-build
  custom-element model (`<wa-*>` instead of `<sl-*>`); a paid Pro tier
  exists and is not needed.
- **Radix Colors** is dropped: the Broadcast canvas already pins every
  colour for dark and light, so a generic 12-step scale adds nothing.
- **Open Props** is dropped: the canvas uses a handful of spacing /
  radius / type values, which a few `--fb-*` tokens cover.
- None of the three old libraries are in the repo (deleted in
  **S-BACK-013**, never referenced by `web/src`).

**Layering - who owns what:**

| Layer | File (planned) | Owns |
|---|---|---|
| Domain tokens | `web/src/tokens.css` + `tokens.js` (exists, hand-synced) | Team home/away, shot open / blocked-off / clear, pass, coverage, trajectory - consumed by both CSS and three.js. Unchanged by the redesign apart from the per-theme values below. |
| Broadcast tokens | `web/src/tokens.css` (new `--fb-*` block) | Neutrals (`ink/ground`, `surf1-3`, `line`, `text1-3`), `--fb-brand #2E6BFF`, the 3 px accent motif, radius, spacing, type scale. Dark = default, light via `[data-theme="light"]` (+ `prefers-color-scheme`). |
| Web Awesome theme | `web/src/theme-broadcast.css` | Maps `--wa-*` onto `--fb-*` only: `--wa-color-surface-{default,raised,lowered,border}`, `--wa-color-text-{normal,quiet}`, `--wa-color-brand-*` (from `--fb-brand`), `--wa-color-focus`, `--wa-font-family-{body,heading,code}`, `--wa-border-radius-*`, `--wa-form-control-*`. Declared in WA's `wa-theme-overrides` cascade layer, `.wa-dark` / `.wa-light` switched together with our `data-theme`. Never hard-codes a colour. |
| App layout + chrome | `web/src/app.css` (extracted from the ~780-line inline `<style>` in `index.html`) | Grid of rail / top bar / stage / right panel / timeline, the Broadcast breakpoints, rink-adjacent chrome, anything WA has no component for. |
| Canvas / WebGL | three.js + `frame-thumb.js` 2D canvas | Rink (fixed blue surface, black boards, white lines), chips, arrows, overlays - read colours from `tokens.js`, never from WA. |

Fonts: **Archivo** (display/UI) + **IBM Plex Mono** (every measurement),
both OFL - self-host the woff2 under `web/lib/fonts/`, no Google Fonts
request at runtime.

**Broadcast element -> implementation map** (from the canvas screens):

| Broadcast element | Web Awesome | Own CSS / JS |
|---|---|---|
| Left rail Plan / Analyze / Library (desktop), bottom tab bar (<768 px) | - (plain `<nav>` buttons, too simple to wrap) | `app.css` rail + 3 px active bar; `shell.js` keeps `[data-mode]` logic |
| Top bar: project name, frame "2 / 6", 2D / 3D, Export, Record | `wa-button`, `wa-button-group` (2D/3D segmented) | layout in `app.css` |
| Tool palette (select, player, ball, cone, arrow, zone, text, shot) + flyouts (ball extras, draw variants) | `wa-dropdown` / `wa-popup` for flyouts, `wa-tooltip` for labels | palette strip + "active tool is the only filled element" rule; `tool-palette.js` logic unchanged |
| Inspector / Layers right panel | `wa-tab-group` + `wa-tab` + `wa-tab-panel`; controls: `wa-select`, `wa-slider`, `wa-switch`, `wa-input`, `wa-button-group` (Head filled/open etc.) | panel heading cap (3 px bar), mono value readouts |
| Right panel on tablet (768-1199) / bottom sheet on phone | `wa-drawer` (`placement="end"` / `"bottom"`) | peek height (~96 px) + drag-to-expand handle (WA drawer has no peek state - own JS) |
| Multi-select bulk bar on the rink (re-team, delete) | `wa-button-group` | floating position over canvas |
| Chip popover | `wa-popup` (Floating UI positioning) | content styling |
| Timeline: frame cards with name, time range, thumbnail, "+", playhead | - | own - it is a custom scrubber over `frame-thumb.js`; `timeline.js` logic unchanged |
| Export / share / import dialogs, help / keymap | `wa-dialog` (replaces the hand-rolled open/close + focus trap in `dialog.js` / `focus-trap.js` per dialog, one at a time) | form layout |
| Library (card grid, search, New play / New analysis) | `wa-card`, `wa-input` (search), `wa-button`, `wa-badge` (Plan / Analyze tag) | grid + thumbnails; `library-dialog.js` data logic unchanged (moves from modal to the Library view) |
| First run (two entry cards) | `wa-card`, `wa-button` | layout |
| Analyze 4-step header Photo / Align / Players / Insights | `wa-stepper` + `wa-step` | wired to existing `photo-step-tracker.js` state |
| Align: before/after divider | `wa-comparison` | photo canvas + rink overlay stay our canvases inside the two slots |
| Align: "Advanced - FOV, lens distortion" | `wa-details` + `wa-slider` | - |
| Align: reprojection-error badge, landmark count | `wa-badge` | mono type |
| Insights: verdict pill (On target / Blocked-off) | `wa-badge` / `wa-tag` with domain colour | colour from domain tokens, not `--wa-color-*` |
| Insights: mono stat grid (angle, distance, coverage %, clear passes) | - | own grid, IBM Plex Mono, `wa-format-number` optional |
| Status / save state / warnings (coplanar landmarks, detect failures) | `wa-callout`, `wa-toast`, `wa-spinner`, `wa-progress-bar` (model / detection loading) | - |
| Touch D-pad (phone review) | `wa-button` | position + hit sizes |

Rules for the port:

- **Vendor, don't CDN**: copy only the used components + their chunks
  into `web/lib/webawesome/` (same pattern as `opencv.js`, `three`).
  Measure it and add a `web/lib/webawesome` entry to
  `scripts/check-size.mjs`.
- **No `wa-icon` Font Awesome kit**: its default loads from
  `ka-f.fontawesome.com` at runtime (external request, breaks offline).
  Register a local icon library pointing at our own SVGs, or use inline
  SVG.
- **CodeQL**: this is Shoelace's code lineage, which tripped
  `js/bad-tag-filter` before (S-BACK-013). Exclude `web/lib/webawesome/`
  from CodeQL analysis before vendoring, instead of deleting the library
  after an alert.
- **Keep DOM ids**: existing ids (`#inspector`, `#timeline`, `#photoStepper`,
  `#photoAlignSlider`, ...) stay on the element that replaces them so the
  modules' `getElementById` guards (see CLAUDE.md) and the Playwright
  specs keep working. Re-skin first, restructure second, one surface per
  commit, each with its e2e spec extended first.

Tracked as **S-BACK-019** (theme + vendoring), **S-BACK-020** (canvas
gap-fill) and **S-BACK-021** (port order) in section 10.

### Visual direction exploration (design canvas)

A full-fidelity mockup canvas exploring the "ne plus ultra" minimalist
look lives as a Claude Design artifact:
<https://claude.ai/code/artifact/2272914e-271a-4f2b-a083-59dc8ce8e377>
(the `.dc.html` artboards live inside the artifact itself, not the repo).
Three directions, 8 screens each (Foundations, Plan single-select,
Plan multi-select, first-run, Analyze step 2 / step 4, Library, phone):

- **Broadcast / matchday sport** - *chosen.* Deep-ink stage, one
  electric-blue action colour (`#2E6BFF`) that never doubles as a team
  colour, domain green/red intact, Archivo display + IBM Plex Mono for
  every measurement, flat surfaces + hairline borders, a single 3px
  accent motif (active tab underline / panel-heading cap / selection
  ring). No glow, blur or angled corners - the deliberate break from
  today's tactical-HUD look.
- **Instrument** - cold technical (Linear / DAW): matte neutral greys,
  a cold mint accent used only on live elements, 1px rules, dense
  controls, no display face. *Rejected, kept for reference.*
- **Chalk & Court** - warm editorial: bone paper, burnt-orange accent,
  Space Grotesk display, borderless panels, warm-charcoal dark mode.
  *Rejected, kept for reference.*

Fixed across all three: the rink renders as a **blue surface with solid
black boards** and white markings; only the surrounding chrome changes.
Breakpoints: >=1200 px both panels docked; 768-1199 right panel becomes a
slide-over drawer; <768 rail -> bottom tab bar, palette -> scroll strip,
Inspector / Layers -> bottom sheet, timeline pinned. Authoring is
desktop-first; phone is for review, playback and quick nudges.

**Coverage gaps** - closed by **S-BACK-020** (canvas page "Broadcast -
gaps", 13 screens). The original canvas predated several shipped
features and only mocked 8 screens; the gaps were:
Analyze steps 1 (photo / restore / auto-detect) and 3 (players, teams,
ball, facing - the densest screen); shots at goal (aim pad, timing,
verdict, 3D flight, A-BACK-022); tool flyouts (ball extras A-BACK-026,
cones, draw variants, chip popover); the 3D view's chrome (camera,
view-from-ball, coverage / trajectory toggles, goalie model); export /
share / import / help dialogs; the choreography tutorial; empty / loading
/ error / save states; tablet layouts and phone Analyze. Design these in
Broadcast before porting the surface they belong to.
