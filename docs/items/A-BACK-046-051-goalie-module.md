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
- Lessons shelf (2026-11-17): a "Goalie lessons" section at the top of the
  Library dialog, one row per shipped lesson (`lessonShelf(lang)` in
  `goalie-lessons.js`: module order, title in the app language, frames and
  seconds); Open carries `data-action="lesson"` and train-mode.js's
  delegated listener calls `openLesson()`, so library-dialog.js does not
  import train-mode.js (which imports it).
- Pause on captions (2026-11-21): playback holds at the start of a frame
  with a note for a reading time (`caption-hold.js`: 1 s + 60 ms per
  character, 2 to 8 s, estimates), then plays the move. Wall-clock time,
  so slow motion does not stretch it. A "Hold" switch in the recorder's
  transport turns it on or off (decided with the user): until the viewer
  chooses, lessons hold and the coach's own plays do not; the choice is
  then remembered per browser for every play. Not in the video export yet (`seekTo` runs straight
  through), so an exported lesson does not pause.
- All lessons (2026-11-21, captions drafted for the user's review; lesson
  4 `options` was merged into 3 on 2026-11-22, see below):
  1 `line` (ball still while the captions take placement, depth, axis;
  then a slow move), 3 `passOrShot` (a cast of two
  attackers and a defender, played twice from the same start),
  5 `behind` (round the back of the goal, post to post, out in front).
  The builder takes a `cast` and frames with `players`, `carrier` or
  `shot` (aimed at the middle of the goal); lessons 1, 2, 5 keep the
  one-attacker `ball` form. Live goalie ok 90-100% of the time per
  lesson, every keyframe ok (`goalie-track.test.js`, bar 85%).
- Decisions after the first review (2026-11-22, with the user):
  - Lesson 4 "Most dangerous or most likely" is merged into lesson 3: it
    was the same 2-on-1 played twice with the same goalie answers. Its
    idea (most likely vs most dangerous; dangerous option open: stay
    back, ready to push across; closed: play the shot) closes lesson 3's
    last caption. Four lessons ship, numbered 1 to 4 (the "behind" lesson became 4).
  - The verdict chip for a centred block now reads "Centred block", not
    "Squared up": the captions use "square up" for the body facing the
    ball, and the two clashed.
  - Lesson 1 shows the KATA build-up: a frame spec may carry
    `goalie: ['placement', ...]` (the dimensions applied so far). The
    builder stands the goalie on the line but deep and parallel (frame
    1), then forward (frame 2), then square (frame 3), so the KATA rows
    turn green one at a time. The frame gets the optional `goalieFixed`
    flag (kept by `acceptDoc` only when true) and `goalie-track.js` goes
    to that pose instead of following the rules; docs without the flag
    behave as before.
  - Lesson shots end in a save. `shot.saved` is an optional flag; with it
    the frame's ball x / z is the stop point, 0.4 m (estimate,
    `SAVE_FRONT_MM`) short of the goalie on the shot path, and the ball
    drops to the floor there. The aim point and arrow are unchanged and
    shots made in Plan have no flag, so they behave as before. The
    verdict still comes from the shooting line (the app has no goal
    count), so a stopped ball in front of a centred goalie reads as a
    centred block.
  - The German captions keep the swiss unihockey module's English zone
    names (Attention-Zone, Danger-Zone, Passing-First-Zone, Slot) on
    purpose: they are the terms coaches use in the module.
- Lesson 1 as a showcase (2026-11-22, so the lessons explain themselves;
  all pieces are optional data and only lesson 1 uses them, old docs and
  the other lessons are unchanged):
  - Title card and recap card. A lesson carries `doc.lesson = { intro:
    { title?, task }, recap: { title?, bullets } }` (texts as notes, `{ en,
    de }`; `lesson-cards.js`, kept by `acceptDoc`). Opening the lesson shows
    the task ("Watch the goalie: where does it stand, and why?") over the
    stage until the first play (Start, any play, or Close); when a play
    ends the recap (placement, depth, axis) shows with Play again / Close
    (`authoring/lesson-cards-ui.js`).
  - Wrong first, then right. Frames 1 and 2 are the same shot as at the
    end, against a goalie off the line (`goalieDx`, 0.7 m, estimate, no KATA
    dimension applied) and it is a goal (`shot: { scored: true }`, the
    ball rests in the net), caption "What went wrong?". Then the build-up
    (placement, depth, axis), the shooting area, and the same shot from
    the same spot saved (`shot.saved`, as before). Both flights are slow
    motion: `shot: { speedMps: 6, releaseT: 0.15 }` become the ball's
    `pass` settings (6 m/s instead of the 25 m/s default, estimates).
  - Quiet screen. A frame may carry `layers: [...]` (`lesson-view.js`,
    names `line`, `area`, `coverage`, `zones`, `marks`; kept by
    `acceptDoc`). `state.quiet` follows the frame whose caption shows
    (`authoring/lesson-quiet.js`, Train only) and the shooting line, corner
    lines (the shooting area), coverage, zones, zone labels, shooter inset,
    verdict chip, hint pill, zone card and pass lines show only what the
    frame names; the caption and the KATA card always stay. A frame without
    `layers` leaves the screen as the viewer set it.
  - Director camera. A frame may carry `cam: '<shot>'` (`director.js`,
    pure: `wide`, `goalieEyes`, `shooterEyes`, `sideKnee`, `followBall`,
    `pushIn`; kept by `acceptDoc`). The shot holds until a later frame names
    another, the pose is computed live from the ball and the goalie track
    (a function of frames and time, so scrub and export agree) and blends
    from the previous shot over 0.9 s. `playback.js applyDirector()` sets
    the camera; the shot offsets are estimates, tuned by eye in look-shots
    (the goalie eyes sit 0.6 m in front of its centre: nearer, the camera is
    inside the helmet and the glow outline).
  - User takeover. The `Director` switch in the recorder's transport (next to
    Hold and Follow; shown for a play with shots and a live goalie; the
    recorder is a Plan view, Train shows none) and the pill "Free camera -
    Back to director" (de: "Freie Kamera - Zurück zur Regie", over the stage
    in Train and Plan). Any orbit, pan, zoom or key pan of the viewer
    (`user-camera.js` hooks) turns the director off; the pill or the
    switch turns it on, easing back over 0.6 s. A pick from the camera menu
    (the shot list under "From the ball", enabled in any lesson) or a view
    preset also takes the camera. It comes back on its own only when a new
    lesson opens or a play restarts. The video export always uses the
    director (`state.directorForced`).
  - Decided 2026-11-22 (to build): on the "What went wrong?" frame the
    KATA card reads red, grading the goalie's stance when the shot was
    taken, not the ball in the net. Train gets a small transport under the
    stage while a lesson is open: Play/Pause, Restart and the Director
    switch. A camera-menu pick (shot or preset) keeps turning the director
    off. Stop turns the director back on, like a restart.
  - Lessons 2-4 get lesson 1's treatment (decided 2026-11-22, all as
    proposed): title and recap card, quiet screen, director shots, and a
    wrong run first that ends in a goal ("What went wrong?").
    - Lesson 2 "Through the zones": one wrong run first (the goalie stays
      centred and deep, the attacker walks into the danger zone and
      scores), then the right run. Task: "Watch the goalie as the ball
      moves through the zones: what changes in each one?" Layers: the
      zones with the ball's zone on every frame, the shooting line where
      the caption names it. Camera: mostly wide, the shooter's eyes when
      the goalie steps out in the danger zone, a side shot at the post,
      wide behind the goal. Recap: one bullet per zone (attention:
      centred, deep, patient; danger: forward on the shooting line,
      square; passing-first and behind: on the line at the post, knees
      parallel, eyes on the slot).
    - Lesson 3 "Pass or shot": three runs, a wrong read first (the goalie
      steps out for the shot, the pass goes across, goal), then the pass
      read right and saved, then the shot read right and saved. Task:
      "Watch the defender, then the goalie: how does the goalie know
      whether a pass or a shot is coming?" Layers: the pass lane while
      the read is pass, the shooting line once it is shot. Camera: the
      goalie's eyes while the defender decides, a side shot for the
      goalie's answer, follow ball on the pass across, push-in on each
      save. Recap: read the defender first; defender on the carrier: a
      pass is coming, stay back on the line, ready to push across;
      defender in the lane: a shot, step forward and square; most likely
      the shot, most dangerous the pass: while the pass is open, cover it.
    - Lesson 4 "Behind the goal": a wrong run first (the goalie cuts
      through the middle of the goal as the ball goes round, a pass into
      the slot scores), then the right run along the line. Task: "The
      ball goes round the back of the goal: which way does the goalie
      move, and where does it look?" Layers: the zones with the slot,
      the shooting line only once the ball comes out in front. Camera:
      high, from in front of the goal looking back at it; push-in on the
      step out. Recap: ball level with the goal line: on the line at the
      near post, knees parallel; ball behind: slide along the line to
      the other post, never through the middle; eyes: glance over the
      shoulder to the slot; ball out in front: forward onto the shooting
      line, square.
    - Built 2026-11-23: all as decided. New pieces: frame hint
      `goalieRead` (a goalie that reads a pass as a shot), quiet layer
      `lane` (pass lane), director shots `frontHigh` (lesson 4) and
      `goalieClose` (lesson 1's "What went wrong?" frame, under 4 m from
      the goalie), a longer, thicker ball trail. Lesson 4 gained a second
      attacker waiting in the slot. Distances of the new shots, the late
      goalie offset (lesson 3) and the slot player's spot are estimates.
Open: caption review by the user; whether "Open as play" should keep
`autoGoalie` in the copied project.
Follow-up from the video review of all four lessons (2026-11-23, merged
as is, fix later):
- Lesson 2: the wide shots are far away (the attacker small, often at the
  left edge); on "What went wrong?" the ball in the net is not visible;
  behind the goal the ball is a dot at the right edge.
- Lesson 3: the side shots lose the defender the caption talks about; the
  shooter's view inset covers the defender's chip at the top right in some
  frames; at 98 s it is the longest lesson.
- Lesson 4: the carrier behind the goal is tiny from the high front
  camera; the final step out is cut off at the right edge (push-in); on
  the first right-run frame the slot player sits under the two-line
  caption. Check with the user that the slot attacker may stay in the
  right run too.
- Lesson 1: the trail spheres look bulky close to the camera.
- All: a white dot at the bottom right of the high views and a dark spot
  at the bottom left of the caption, not traced yet.
- The shooter's view inset should avoid players: move it, or shrink it,
  when a player sits under it.

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
