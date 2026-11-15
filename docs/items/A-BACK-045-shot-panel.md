# A-BACK-045 - Shot overlays in the ball's Inspector

Status: open. Added 2026-11-15 after the ball-to-goal lines "stopped
working" in the new layout. Draft and decisions:
<https://claude.ai/artifact/LW1DX1aYLtTxA3JD63JooG> (variant B chosen).

Step tags: `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md).

## What was wrong

- The lines, the shooting line and coverage drew only after a goal was
  clicked on the canvas. In the fitted 3D overview the goal is a few
  pixels wide with the goalie in front, so the click picked the goalie;
  the Layers panel's goal rows never set the target; the readout sat in
  the folded Coordinates section.
- The controls were loose rows in the View section (lines, outline,
  coverage, align goalie, view from ball, reset view).
- The home goalie was selected on every boot (`activateGoalieModel`
  read `undefined === undefined` as "was selected").

## Decisions (user, 2026-11-15)

1. **B:** the shot controls live in the match ball's Inspector, shown
   while the ball is selected. The overlays on the rink stay on when
   another object is selected.
2. **Target:** Auto (the goal nearer the ball) by default; Home / Away
   pick one. Clicking a goal or its goalie picks it too.
3. **Verdict chip on the rink:** yes, next to the targeted goal, in the
   shooting-line colours (open / blocked off-centre / squared up + %).
4. **Lines in 2D:** yes. They already draw in the top-down view
   (checked 2026-11-15); keep it so.
5. **Goalie outline:** no toggle; the glow comes with the shooting line.

## Steps

1. `[done 2026-11-15]` **Auto target** (PR #43). `shot-target.js`,
   `state.js` `shotGoal()`; coverage / trajectory / align / from the
   ball read it; `selectObject` picks for a goal or goalie; all shot
   overlays start off; boot no longer selects the home goalie. Tests:
   `test/shot-target.test.js`, `test-e2e/shot-target.spec.js`.
2. `[done 2026-11-15]` **Shot view state, pure.** `shot-view.js`:
   `parseShotView(stored)` -> `{ lines, shotLine, coverage }` (all
   false by default, bad input -> defaults, as `panel-layout.js`),
   `toggleShotView(view, key)`, `outlineShown(view)` (= `shotLine`),
   `anyShotOverlay(view)` (the chip shows then). Storage key
   `floorball3d.shotView`. Test: `test/shot-view.test.js`.
3. `[done 2026-11-15]` **Shot section in the ball's Inspector; View rows go.**
   As built: `authoring/shot-section.js` (target radios with
   `endName()`, a note on what Auto aims at, verdict card from
   `state.shotReadout`, chips Lines / Shooting line / Coverage, Align
   goalie, From the ball); `shot-view-state.js` loads / saves
   `state.shotView`; trajectory.js draws corner lines and shooting line
   separately, the glow follows the shooting line; `alignGoalie()` and
   `viewFromBall()` exported; `#coveragePct` gone (the card shows the %);
   View keeps a hint and Reset view. Tests:
   `test-e2e/shot-panel.spec.js`; shot-target and trajectory specs moved
   to the state. Original text:
   `authoring/shot-section.js` builds it: target segmented control
   (Auto / Home / Away, `role="radiogroup"`), verdict card (title +
   % blocked, live through a `shotReadoutChanged` event), three
   toggle chips (`aria-pressed`), Align goalie, From the ball.
   trajectory.js / coverage.js read the shot view state instead of
   `#trajectoryCheckbox` / `#coverageCheckbox` / `#goalieOutlineCheckbox`;
   those rows, `#alignGoalieBtn` and `#viewFromBallBtn` leave
   `index.html` (the Views menu calls an exported `viewFromBall()`);
   Reset view stays in View. e2e first: select the ball, switch the
   lines on, pick Away, the overlays follow; select a chip, the
   overlays stay; reload keeps the toggles; a11y spec stays green.
4. `[done 2026-11-15]` **Verdict readout, gated** (built before step 3,
   which needs it). `shot-readout.js`: `shotReadout({ ballWorld, goal,
   goalie })` -> `{ goal, key, pctBlocked }`; `updateShotReadout()` in
   main.js's loop keeps `state.shotReadout` and fires
   `shotReadoutChanged`, only when the trajectory gate's inputs move.
   `insights.js` `shotVerdict` now tests the goalie's proxy too, so the
   verdict and the % agree. Tests: `test/shot-readout.test.js`,
   `shot-target.spec.js`.
5. `[small]` **Verdict chip on the rink.** Replaces the old
   `#goalieLabel` ("NN% blocked" over the goalie): dot + verdict +
   %, placed by the targeted goal, shown while any shot overlay is on,
   hidden in Present (`PRESENT_HIDES`). e2e: chip text follows the
   verdict; hidden with all overlays off.
6. `[lead]` **Look check** in 2D and 3D at 1440 x 900 and 1280 x 800,
   line widths in top-down, chip placement near the boards.
