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
- Language switch in the goalie lens (EN / DE), remembered per browser
  (localStorage, like the shot overlays). The first default comes from
  the browser language (`de*` -> German, else English).
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

### A-BACK-050 - "Place the goalie" exercises `[small]` after 046

A set of situations (ball, carriers, expected action); the user drags
and turns the goalie; "Check" scores it with `judgeKata` and coverage,
shows the ideal as a faint ghost and the two shooter's views side by
side, with one hint sentence. Score kept per browser. Tests: scoring is
pure; e2e: one situation end to end.

### A-BACK-051 - Ideal goalie `[lead]` (with A-BACK-043)

`idealGoalie(ball, zone, action)` -> position and facing from the zone
rules. Shown as a ghost on demand in any play; it is also the first
version of A-BACK-043's automatic goalie. Needs A-BACK-042 for the
Körper part (pose per zone / action).

## Order

052 -> 048 -> 046 -> 047 -> (A-BACK-035 frame notes) -> 049 -> 050 -> 051.
Körper (body) follows A-BACK-042 steps 3 to 5; 051 merges into
A-BACK-043.

## Decisions (2026-11-15)

- A-Q-007 content rights: default. Our own words, a link to the module,
  no copied images.
- A-Q-008 where it lives: default. A goalie lens in Plan (goalie
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

A-Q-006 (goalie height) matters more now: a U14 goalie covers less.
