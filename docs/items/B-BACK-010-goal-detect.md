# B-BACK-010 - Goal auto-detect robustness

Status: in progress, parked. Resume at step 3.1: run
`pnpm eval:goals -- --model-fit` against the 0/80 baseline and keep the
3D model fit only if the numbers improve. Whether this is worth time at all
depends on M-Q-001 (does auto-align matter for the first demo, or is
manual alignment acceptable?).

The full working notes below are moved unchanged from the old plan
(2026-10-15). They are the model for how a substantial item should look:
measured baseline, harness, reverted heuristics recorded as lessons, a
numeric "done when".

**[B-BACK-010]** **Goal auto-detect robustness plan
(steps 1-2 done, baseline recorded; resume at step 3).** Goal: ROI goal detect works across many
different goal photos, not just the two it was tuned on. Photos vary a
lot (broadcast wide shots, close-ups, side angles, goalies of any
colour, red clutter in stands and floor ads, different venues), so
every improvement has to come from **goal specifics** (what every
floorball goal shares), never from tuning to one photo.

**State at end of 2026-09-23.** Pipeline:
`detect.js` `detectGoal(image, roi, {debug})` -> crop + upscale (max
2048 px / 4x) -> scoped red hue mask (145-180) -> Canny -> HoughLinesP
-> `goal-frame.js` `fitGoalFrame()` -> fallback `detect-posts.js`
`cornersFromPosts()` -> fallback `minAreaRect`. Pass `{debug: {}}` to
get every Hough line plus every candidate frame with its score or
reject reason. That is the first thing to look at when a photo fails.
Evaluation so far was manual: dynamic `import()` of `detect.js` inside
`page.evaluate` in the live browser, 8 ROIs on one close-up photo,
compared against hand-read corners. (Commits `f430e8f`, `825376c`,
`c7eb9ed` are on `origin/main` now.) Superseded by the batch harness
in step 2.

**Lesson from B-BACK-009:** three plausible heuristics (crossbar
overhang penalty, strict edge-continuity foot walk, robust re-fit)
each made results *worse* on real photos and were reverted. So no
heuristic gets kept without a before/after number from the harness in
step 2.

**Steps:**
1. **Fixture set.** Collect 8-12 varied goal photos under
   `test/fixtures/goals/`. Add the folder to `.gitignore` if the
   photos can't be shared publicly. Add one `truth.json` holding, per
   photo, the 4 hand-labelled mouth corners (TL, TR, BR, BL, in image
   px, on the tube centre line) and 3-5 ROIs (tight, loose, offset
   left/right, nearly whole image). Coverage checklist:
   - the broadcast frame from B-BACK-008;
   - the close-up with clutter from B-BACK-009;
   - side angle around 45 deg;
   - near head-on;
   - a goalie hiding most of one post;
   - a crossbar in front of white ads;
   - low light or motion blur;
   - a different floor colour;
   - red seats or red stand poles above the goal;
   - a goal seen from behind or at an extreme angle (expected fail,
     must not crash).
2. **Batch eval harness.** A local-only script
   (`scripts/eval-goal-detect.mjs`, driving Playwright against
   `serve-static.mjs`) loads each fixture and runs `detectGoal` per
   ROI with `debug`. It prints a table of per-corner error normalised
   by the true goal height, plus a pass rate (pass = all 4 corners
   within 3% of goal height). For every failure it writes the debug
   candidate list to `test-results/goal-eval/`. It is not a CI gate
   (fixtures may be git-ignored). Record the baseline numbers in this
   item before changing any detection code.

   **Done (2026-09-23).** Steps 1 + 2 shipped:
   - Fixtures: 16 YouTube broadcast screenshots in
     `test/fixtures/goals/` (git-ignored, not shareable). They cover
     the checklist except the B-BACK-008 / B-BACK-009 originals, which
     are gone. Extras: grey floor (goal seen from behind), green floor
     with a dark maroon frame, and a near edge-on goal. Six still carry
     the red YouTube progress bar; in two it crosses the goal bottom.
   - Labels: `truth.json` in the same folder, written by
     `pnpm label:goals` (`scripts/label-goals.mjs`, local page on
     :8010: click TL/TR/BR/BL, wheel/pinch zoom, autosave; drafts show
     `?` until confirmed with Enter). All 16 hand-confirmed. On goals
     seen from behind, the labeller picked the **outer** frame as the
     mouth in WFC 01, Hardau and Backhand 02.
   - Harness: `pnpm eval:goals` (`scripts/eval-goal-detect.mjs`,
     options `--only <substr>`, `--roi <name>`, `--truth <file>`).
     The ROIs are generated from the labels by
     `scripts/goal-eval-lib.mjs` `roiVariants()`: tight (+10%), loose
     (+75%), left/right (goal against one edge), whole (image minus 2%,
     never cutting the goal). Error = best-matching corner order, as a
     fraction of the mean post length; `orderOk` flags a reversed
     order. Output goes to `test-results/goal-eval/` (summary.md/json,
     an overlay JPEG per case, debug JSON per failure). `pnpm test:e2e`
     wipes that folder. `detectGoal`'s debug now also reports `source`
     (frame / posts / contour) and `map` (`{scale, offsetX, offsetY}`)
     to convert debug coords back to image px.

   **Baseline (2026-09-23, commit that added the harness, 16 photos x
   5 ROIs = 80 cases):**
   ```
   pass (<= 3%): 0/80   <= 10%: 13   <= 25%: 15   miss: 7   crash: 0
   per ROI: tight 0/16, loose 0/16, left 0/16, right 0/16, whole 0/16
   corner order reversed in 12 detections
   ```
   Failure groups, read from the table and overlays:
   - **Small / washed-out goals (55-97 px tall): total failure.**
     SUI-FIN 01, 02, 04, Backhand 01, WFC 02 are over 100% or missed on
     every ROI. On blue floors the frame renders pinkish-magenta and
     apparently drops out of the red mask, so the contour fallback
     grabs a red jersey instead. **Largest group, check this first:**
     corner refinement can't fix a goal that is never masked.
   - **Wrong frame or bottom too low (20-90%).** WFC 01 + 03, Hardau,
     Backhand 02, Penalties 01 + 05. The bottom edge follows the
     floor-level back bar, or front and back frame parts get mixed
     (= known failure 3a).
   - **Whole-image ROI** is much worse than tighter ROIs on every
     small goal (= known failure 3b).
   - **Near misses:** SUI-FIN 03 (3.8-4.0%), Penalties 02 (4.0-4.7%),
     Penalties 04 (6.3-7.5%). They look right in the overlay; one
     corner is off by a few px. On a 67 px goal, 3% is 2 px, about
     the label's own click precision, so also track <= 5% / <= 10%
     alongside the 3% headline.
3. **Known failures, attack in this order** (each fix gets a synthetic
   mask unit test in `goal-frame.test.js` first, then a harness
   re-run). **Reordered after the baseline:** 3.0 and 3.1 come first.
   The old a/b become symptoms that the 3D model fit (3.1) should
   resolve without separate heuristics. Keep them only as a fallback
   if 3.1 doesn't pay off.

   3.0 **Red mask on small / washed-out goals** (baseline group 1).
      Measure the goal pixels' real HSV values on the 5 photos (mask
      coverage along the labelled frame vs. the scoped 145-180 hue
      band and `RED_MIN_SAT` / `RED_MIN_VAL`) before touching any
      threshold. If the frame falls out of the band, widen or adapt the
      band (e.g. relative to the local floor colour) and re-run the
      harness. A model fit can't align to pixels that never reach the
      mask.

      **Result (2026-09-23): don't tune the thresholds.** The labelled
      frame pixels were sampled (reddest pixel across the tube, every
      px along crossbar + posts):
      - Goals 118-416 px tall: 73-94% of frame samples pass the mask
        (hue 165-176).
      - Goals 55-97 px tall: **0-23% pass**. The frame is violet (hue
        128-131; Backhand 01: 102 = floor blue). Cause: the tube is
        only 2-3 px wide, and video chroma subsampling blends its red
        into the blue floor. There is hardly any red left to find.
      - Hardau: the dark maroon frame in dim light fails on value
        (70% of samples have V < 70).
      - R-G contrast vs. the floor a few tube widths away is positive
        on every photo, but thin on small goals (median 8-44, p10
        around 0-10). No per-pixel threshold separates it from floor
        edges, jerseys and floor lines.
      So the fix is to **integrate weak evidence along a known shape**:
      3.1 scores a continuous "redder than local background" map along
      the whole projected 3D frame, not a binary mask.
   3.1 **3D goal model fit.** Use the real goal geometry from
      [generate_goal.py](../../generators/generate_goal.py) (IFF spec:
      mouth 1600 x 1150, upper depth 400, lower depth 650, 100 mm
      corner radius, back bars) as the reference. Project its tube
      centrelines with a camera pose and adjust the pose (6DoF + focal)
      until the projected tubes sit on the red-mask edges (e.g. a
      distance transform of the mask edges). Start from the existing
      pipeline's best candidate (or the user ROI).
      - **Resolves:** front vs back frame confusion (goals seen from
        behind), hidden posts (implied by the rest of the frame),
        quads a real goal can't produce (aspect + perspective built
        in), and it yields the camera pose Mode B needs anyway.
      - **Doesn't resolve:** goals that never reach the mask (3.0),
        although scoring evidence along projected tubes can accept
        weaker cues than a hard red/not-red mask. Also local minima
        (needs a decent start), and focal vs distance ambiguity on
        tiny goals (constrain FOV or camera height).
      - Unit-test on synthetic masks rendered from a known pose
        (round-trip the pose), then keep it only if `pnpm eval:goals`
        improves.
      - **Status: implemented, opt-in, real-photo eval pending.**
        [goal-model-fit.js](../../web/src/authoring/photo-overlay/goal-model-fit.js),
        tests in [goal-model-fit.test.js](../../test/goal-model-fit.test.js)
        (synthetic front view with clutter, goal seen from behind
        started on its back frame, small washed-out violet goal: all
        under 2% corner error). `detectGoal(img, roi, { modelFit: true })`
        fits from the frame/posts quad, the contour quad and the inset
        ROI; `pnpm eval:goals -- --model-fit` compares against the
        baseline. Off by default until the eval shows it helps.
        Lessons from getting the synthetic cases green:
        - Evidence is R-G minus its local mean (not the HSV mask),
          judged on a 1 px blur; each segment counts by projected
          length.
        - The back frame is itself a planar 1600 x 1177 mm rectangle:
          a start quad that is really the back frame is converted to
          the mouth it implies (exact pose), not shifted by a guess.
        - Do NOT optimise over the 4 corner coordinates: the focal
          length they imply swings from 1400 to 170 with 1-2 px of
          corner noise, trapping the fit at "mouth right, 3D wrong".
          The fit uses [u, v, log(f/Z), rotation vector, log f]
          instead, so f only changes perspective strength.

   a. **Bottom corners 25-50 px too low.** The foot walk runs past the
      real post end into floor ads or shadow. Candidate fixes, all
      goal-specific:
      - clamp post length from the crossbar width and the known
        mouth aspect (W 1600 x H 1150 mm, see
        [generate_goal.py](../../generators/generate_goal.py)), allowing
        for perspective via the two post directions;
      - stop the foot where the post line meets the floor or net
        bottom edge.
   b. **ROI covering nearly the whole photo** picks a fake frame (a
      stand railing plus the poles above the posts). Candidate fixes:
      - an aspect prior (160:115 within perspective limits);
      - require net texture (white or grey mesh) inside the mouth;
      - two-pass: take the best candidate, re-run inside a tight ROI
        around it, and keep the result only if it is stable.
   c. **Broadcast frame regression check** (B-BACK-008 photo) - must
      still pass after a and b.
4. **Goal specifics not used yet** (ideas pool for step 3):
   - the net inside the mouth;
   - the fixed mouth aspect;
   - the side frame and back frame going away from the camera
     (gives depth direction, which helps L/R and head-on
     disambiguation);
   - the crossbar is a single straight tube, so a crossbar line that
     runs far past both posts is probably a railing. Only retry this
     with harness numbers, since it was reverted once.
5. **Stretch:** run `fitGoalFrame` on whole-image detect too, which
   would give an auto ROI with no user box.

**Done when:** harness pass rate is at least 90% on the fixture set,
no regression on the two known photos, every new constraint has a
synthetic-mask unit test, and `pnpm test`, `pnpm test:e2e`,
`pnpm run build` and `pnpm run check:size` are all green. No new e2e
spec is needed unless the UI changes (this is pure logic).
