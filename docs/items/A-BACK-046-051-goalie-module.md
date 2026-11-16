# A-BACK-046 to 052 - Goalie module: positioning with KATA and the zone model

Status: open. Added 2026-11-15. Clickable draft (goalie lens, lesson
player, exercise): <https://claude.ai/artifact/MWo96HehmtLYkQJM8yimvw>.

Step tags: `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md): failing test first,
then the code, then `pnpm test`, the affected e2e specs, build and
size check.

## Why

The user wants to use the rink for goalie training too. The reference
is the J+S / swiss unihockey learning module "Trainerbildung: Goalies -
Positionierung" (<https://swiss-unihockey-lernmodul.lernetz.site/module/goalies-positionierung>,
read 2026-11-15: 6 chapters, 29 images, 6 videos). Its diagrams are
drawn the way this app already calculates: a top view with the
shooting line and the lines to the posts, next to the shooter's view of
how much of the goal the goalie covers. Its "Winkelband" (angle tape)
drill is our corner lines plus coverage.

**Content rights:** the module's text, photos and diagrams belong to
J+S / swiss unihockey. We write our own short explanations, link to
the module as the source, and copy no images. Quoting their zone cards
word for word needs their permission (A-Q-007).

## What the module teaches (our summary)

- **Principle:** position by the attackers' most dangerous option
  (*gefährlichste Option*) or most likely action (*wahrscheinlichste
  Aktion*), so that as much body area as possible is in the shooting
  line (*Schusslinie*: ball to the centre of the goal).
- **Four dimensions, "KATA":**
  - *Körper* (body): feet, leg width, hip angle, arms.
  - *Ausrichtung* (placement): left or right of the shooting line
    (e.g. towards the far post against a free hit, because of the wall).
  - *Tiefe* (depth): forward or back; forward shortens the angle.
  - *Achse* (axis): knees and chest square to the shooting line for a
    shot; parallel to the goal line when a pass is expected
    (*Verschiebungsvorbereitung*, getting ready to move).
- **Zone model** (defensive transition and defence):

  | Zone | Motto | Placement / depth / axis |
  | --- | --- | --- |
  | Awareness (other half) | recover | stand, loose, wide view; the dimensions do not matter |
  | Attention (middle) | stay patient | neutral, centred, deep, axis parallel to the goal line |
  | Danger zone + slot | full alert | shot: forward, square; pass: back, knees parallel; dribble: forward |
  | Passing-first (behind / beside the goal) | play the line | feet in the goal, knees parallel to the goal line, glances to the slot |
  | Defensive transition (counter) | wide awake | on the shooting line; forward against the carrier, back against a player without the ball |

  Each zone also has gaze (*Blick*) and communication rules; those stay
  text in the zone card.

## What the app already has

- Shooting line, corner lines, coverage % and verdict
  (A-BACK-045, `shot-readout.js`), coverage through a capsule proxy
  (A-BACK-042 steps 1-2).
- "From the ball" camera, Present, recorder, MP4 export.
- Tactical zones as layers (A-BACK-039).
- Ball events per player with timing (`figure-actions.js`, A-BACK-041
  step 2): the next pass or shot is known, so the "expected action" can
  be read from a play instead of set by hand.

## Items

### A-BACK-052 - Goalie content in English and German `[small]` (first: every later step writes its text through it)

The app has no translations yet (`index.html` is `lang="en"`), so this
starts small and only covers the goalie module:
- Pure `web/src/goalie-i18n.js`: `GOALIE_TEXT = { en: {...}, de:
  {...} }` and `goalieText(key, lang, vars)`; a missing key falls back
  to English. Zone names and cards, KATA rows and hint sentences, the
  verdict words, lesson titles, exercise texts.
- Language switch, app-wide (A-Q-010, revised 2026-11-16): a globe
  button at the bottom of the left rail (English / Deutsch), remembered
  per browser (localStorage, like the shot overlays), in `state.lang`.
  The first default comes from the browser language (`de*` -> German,
  else English). Only goalie training is translated at first.
- KATA keeps its German letters in both languages: English shows
  "Body (Körper)", "Placement (Ausrichtung)", "Depth (Tiefe)", "Axis
  (Achse)", so the acronym still reads.
- Lesson docs (A-BACK-049) store captions per language (`{ en, de }`);
  user-written frame notes (A-BACK-035) stay one language.
- Our own wording in both languages (A-Q-007); German uses the
  module's terms (Schusslinie, Verschiebungsvorbereitung) so coaches
  recognise them.
Tests first: every key exists in `en` and `de` with the same
placeholders; fallback to English; browser-language default. e2e: the
switch changes the zone card and the KATA rows, and the choice
survives a reload.

### A-BACK-054 - Train mode `[lead]` (added 2026-11-16, before 048)

A fourth rail mode, "Train", next to Plan / Analyze / Library
(A-Q-008 revised):
- Rail button `data-mode="train"`; `shell.js` shows `[data-view="train"]`
  and hides Plan's editing UI (tool palette, timeline, dock, Inspector)
  the same way Analyze does.
- **Own practice rink (A-Q-011):** entering Train stashes the Plan doc
  and shows a training doc (a free situation by default: ball in the
  danger zone, goalie in the goal); leaving restores the Plan doc
  exactly. Nothing from Train is written to the user's projects or
  autosave. "Open as play" copies the situation into Plan as a new
  project.
- Layout A (A-Q-012, 2026-11-16): `#trainPanel` is a see-through
  overlay over the stage, no side panel. Zone card top-left (A-BACK-048),
  KATA card bottom-left (A-BACK-046), both collapsible and remembered per
  browser; the hint is a pill next to the goalie; the shooter's view
  (A-BACK-047) goes top-right. Title, Open as play and the module link
  sit in the top bar. The camera frames the defending goal from high in
  the rink; leaving gives Plan its own view back. Goalie and ball are
  dragged directly in 3D; turn buttons and Q / E turn the goalie.
Tests first: the doc stash / restore is pure (Node test: entering and
leaving returns a deep-equal Plan doc, the Train doc never reaches the
save path). e2e: rail button switches mode, Plan's play is unchanged
after moving the goalie in Train, reload lands in Plan.

### A-BACK-048 - Goalie zone layer `[small]` (first: everything else reads the zone)

Pure `web/src/goalie-zones.js`: `GOALIE_ZONES` (geometry per end, mm,
estimates read off the module's diagram, commented as such) and
`goalieZoneOf(ball, goalLetter)` -> `'awareness' | 'attention' |
'danger' | 'slot' | 'passing'`. Draft numbers (goal A, z from the end
board): passing-first z < 4 m; danger z < 16 m; slot a trapezoid from
3.8 m to 10.9 m, half-width 2.4 m widening to 3.75 m; attention 16 to
26.6 m; awareness beyond. Mirrored for goal B.
Layer: floor overlay in front of the defending goal, the ball's zone
highlighted, a zone card (our wording). A regular entry in the Layers
panel; the goalie lens switches it on, the user can switch it off.
Tests first: zone of sample
points for both ends; mirror symmetry. e2e: layer toggles, the card
follows the ball.

Borders reviewed 2026-11-16: kept as drafted (attention still reaches 6.6 m past
the centre line).

### A-BACK-046 - KATA readout for the goalie `[small]`

Pure `web/src/kata.js`:
- `kataOf({ ball, goalCenter, goalie })` -> `{ placementMm` (lateral
  offset from the shooting line at the goalie's depth, as
  `shotLineXAtZ`), `depthMm` (from the goal line), `axisDeg` (goalie
  facing vs the shooting line), `axisToLineDeg` (vs the goal-line
  normal) `}`.
- `kataTargets(zone, action)` -> ranges per dimension (estimates,
  commented): e.g. danger + shot: placement |x| <= 100 mm, depth 0.7 to
  1.6 m, axis square to the shot +/- 10 deg; danger + pass: depth 0 to
  0.5 m, axis parallel; attention: centred, deep, parallel;
  passing-first: on the goal line, parallel, ball-side post.
- `judgeKata(kata, targets)` -> per dimension `ok | adjust` + one hint
  sentence.
- `expectedAction(frames, goalLetter, elapsedMs)` -> `'shot' | 'pass'
  | 'dribble'` from the next ball event (`figure-actions.js`), with a
  manual override.
UI: goalie selected -> a KATA section in its Inspector (like the
ball's Shot section): four rows (Körper greyed until A-BACK-042 step
3), coverage %, Shot / Pass switch, "Show the ideal". Tests first for
every pure function; e2e for the section.

Tight angle (added 2026-11-16, found building the lessons): a ball wide
and close to the goal line is still in the danger zone, but "step forward
on the shooting line" put the goalie metres to the side, level with the
ball (Auto position did it too). Below `TIGHT_ANGLE_DEG` (25 deg, an
estimate) between the shooting line and the goal line, danger and slot use
the passing-first targets (on the line at the ball-side post);
`shotAngleDeg()` in `kata.js`, passed to `kataTargets()` by the readout,
the lessons and the live goalie.

KATA on the rink (added 2026-11-16, mock: third row of
<https://claude.ai/artifact/Dvebi8ZfC8rea9WpHEdm16>): `kata-visuals.js`
(pure) gives the target band on the reference line between the target
depths (+/- the placement tolerance, at least 0.15 m), the ideal footprint
in its middle, the current and target facing rays with the turn arc, and
the placement offset; `kata-marks-layer.js` draws them in Train (green
when in range, yellow to adjust). A Marks toggle (remembered) and a Focus
goalie button (`trainFocusPose`, a close camera in front of the goalie)
sit in the KATA card.

### A-BACK-047 - Shooter's-eye inset ("Winkelband") `[lead]`

A small inset (decided 2026-11-15, no split screen) rendered from the
ball toward the targeted goal (second camera, scissor viewport or a
small canvas) in a corner of the stage, shown with the
goalie lens; updates while the goalie or the ball moves; hidden in
Present unless switched on. Watch frame time (second render only on
change, as S-BACK-011). Look check by eye. e2e: inset visible, its
camera sits at the ball.

### A-BACK-049 - Goalie lessons `[lead]` (needs A-BACK-035 frame notes)

Five short plays shipped with the app as read-only lesson docs, opened
from a "Lessons" shelf in the Library; "Open as play" copies one into
the user's projects:
1. Shooting line and area (one dimension at a time).
2. Through the zones (attention -> danger -> behind the goal).
3. Pass or shot (the same 2-on-1, knees parallel vs square).
4. Most dangerous option or most likely action.
5. Behind the goal (play the line, post to post).
Captions per frame (A-BACK-035), pause on captions, the inset and the
verdict chip on. Lesson docs go through `acceptDoc()` like any import;
a Node test validates each one.

Pilot, 2026-11-16 (decided with the user: live goalie, fixed lesson
camera to be revisited, captions as drafted for review):
- Lessons are built in code, not shipped as JSON: `goalie-lessons.js`
  holds the ball path, durations and `{ en, de }` captions; the goalie
  in each keyframe comes from `idealGoaliePose()`, so a rule change moves
  the lessons with it. Lesson 2 "Through the zones" is the first.
- Live goalie: lesson docs carry `autoGoalie: 'A' | 'B'` (kept by
  `acceptDoc`, junk dropped). During playback that goalie follows
  `goalie-track.js`: the ideal pose sampled every 40 ms, moving at most
  3 m/s and turning at most 360 deg/s (estimates), so it never teleports
  at a zone change. Ok on all KATA dimensions 92% of the time in lesson 2;
  the rest is the half-second recovery after a zone or angle change.
  The zones and the readout defend the lesson's goal throughout
  (`defendingGoal(ball, pinned)`), even while the ball is nearer the
  other end.
- Lesson camera: `lessonPose()` in `camera-presets.js`, high over the side
  board looking across the defending half (goal on the right, clear of
  the caption and the cards). A view from behind the goal put the goal
  under the caption. The user wants to revisit it.
- `openLesson(key)` in `train-mode.js` enters Train and shows the lesson;
  the Lessons shelf in the Library will call it.
Open: lessons 1, 3, 4, 5; the shelf; pause on captions; whether "Open as
play" should keep `autoGoalie` in the copied project.

### A-BACK-050 - "Place the goalie" exercises `[small]` after 046

A set of situations (ball, carriers, expected action); the user drags
and turns the goalie; "Check" scores it with `judgeKata` and coverage,
shows the ideal as a faint ghost and the two shooter's views side by
side, with one hint sentence. Score kept per browser. Tests: scoring is
pure; e2e: one situation end to end.

### A-BACK-051 - Ideal goalie

Started 2026-11-16 with A-BACK-047: `idealGoaliePose()` in
`web/src/shooter-view.js` (position from the target band's middle, facing
from the axis target; every KATA dimension judges ok there, Node-tested
for every zone and action at both ends) and an Auto position button that
glides the goalie there. The ghost and animations build on it. `[lead]` (with A-BACK-043)

`idealGoalie(ball, zone, action)` -> position and facing from the zone
rules. Shown as a ghost on demand in any play; it is also the first
version of A-BACK-043's automatic goalie. Needs A-BACK-042 for the
Körper part (pose per zone / action).

## Order

052 -> 054 (Train mode) -> 048 -> 046 -> 047 -> (A-BACK-035 frame notes) -> 049 -> 050 -> 051.
Körper (body) follows A-BACK-042 steps 3 to 5; 051 merges into
A-BACK-043.

## Decisions (2026-11-15)

- A-Q-007 content rights: default. Our own words, a link to the module,
  no copied images.
- **Revised 2026-11-16 (A-Q-008, A-Q-010, A-Q-011):** the module lives in
  a **Train** mode in the left rail (A-BACK-054) with its own practice
  rink, not in Plan's Inspector; the language switch is app-wide, at
  the bottom of the rail. Where the items below say "goalie lens" or
  "Inspector", read "Train panel".
- A-Q-008 where it lives (superseded, see above): default. A goalie lens in Plan (goalie
  selected) plus a "Lessons" shelf in the Library.
- A-Q-009 expected action: default. Read from the play's next ball
  event, with a manual Shot / Pass override.
- Gauges: the goalie's Inspector always lists all four KATA rows; the
  worst dimension that is off is tinted and carries the one hint
  sentence; the chip on the rink names only that dimension.
- Shooter's view: inset, everywhere (Plan, lesson Present, exercise
  check); no split screen. Comparison draft:
  <https://claude.ai/artifact/2fFwsx6PRpK4urhBBSMu1v>.
- Languages: the goalie content switches between English and German,
  more later (A-BACK-052, added 2026-11-15).
- Zone layer: switched on when the goalie lens opens, but it is a
  regular entry in the Layers panel, so the user can switch it off
  (A-BACK-048).

A-Q-006 (goalie height), decided 2026-11-16: support both. A per-goalie
Adult / U14 setting is its own item, A-BACK-053; coverage, KATA targets
and the ideal goalie read the goalie's size.
