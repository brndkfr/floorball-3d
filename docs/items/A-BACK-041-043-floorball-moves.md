# A-BACK-041 to 043 - Real floorball moves for players and goalies

Status: open. Review of 2026-11-14. Builds on A-BACK-032 (gait clips)
and A-BACK-034 (stance + stick IK), see
[A-BACK-033-034](A-BACK-033-034-player-kit.md).

Step tags: `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md): failing test first,
then the code, then `pnpm test`, the affected e2e specs, build and
size check. Use `pnpm run look -- --at <ms>` (S-BACK-030 step 0) to
look at any pose.

## Where we are

- Players have four clips (idle, walk, jog, sprint) and one fixed
  ready stance with the stick on the floor in front. They never pass,
  shoot, receive or dribble: the ball leaves a statue.
- Figures always turn to face their run direction (`facingYaw()`), so
  nobody backs off or shuffles sideways while watching the ball.
- The goalie is a static scanned mesh in one kneeling pose. It cannot
  move a hand.

## Why not motion capture

Searched 2026-11-14: no free or CC0 floorball or hockey motion capture
with stick shots or goalie saves turned up; hockey packs on the asset
stores are paid and hand-keyed for ice hockey (skating, different
stick). The Quaternius library (free tier, the one we use) has no
stick moves. Universal Animation Library 2 (130+ clips, CC0, same
rig) is worth one look for backwards / sideways running and crouch
clips, see 041 step 6.

So the moves are **procedural**, which fits this code base:
- every pose is already a pure function of the doc and the playback
  time (`figure-gait.js`), which `seekTo()` and the MP4 export rely on;
- the stick is already placed in figure space and both arms are solved
  onto it (`figure-stick.js`, `twoBoneElbow`). If the stick moves, the
  arms, shoulders and hands follow for free;
- the doc already knows every event: the carrier per frame, each
  pass with its release time and speed, each shot with goal and aim
  point (`ball-pose.js`, A-BACK-020 to 025).

A move is therefore a short keyframed **stick track** plus a few body
numbers, all timed backwards from the moment the ball leaves the
blade. The tracks live in one data file a human or a model can tune
by looking at screenshots.

## Hard rules (all three items)

- Pose = f(frames, id, elapsedMs). No wall-clock state, no
  accumulation between renders. Test: posing at t, then t2, then t
  again gives the same bones as posing at t once.
- All new math goes in three-free modules with Node tests written
  first; `figures.js` / `figure-stick.js` only apply results to bones.
- `resetStanceBones()` before `mixer.update()` stays (see its
  comment): any bone a new layer touches must be added to `bones()`.
- Every number in a track is a look-based estimate and is commented
  as such, until the user supplies reference photos or video.
- 2D top-down view, share format and hit-testing do not change unless
  a step says so.

---

## A-BACK-041 - Player moves

### Data model

```js
// figure-local mm: +Y up, figure faces +Z, +X is the player's LEFT.
// Written for a left-handed player (blade on the left); mirror x for 'R'.
// t in ms relative to the release (pass, shot) or arrival (receive).
{ t: -420, blade: { x: 350, y: 0, z: -300 },   // blade floor-contact point
           top:   { x: -60, y: 900, z: 80 },    // top-hand grip point
           roll: 0,          // deg, blade face open / closed
           twist: -25,       // deg, torso yaw on top of the stance
           lean: 35,         // deg, spine forward lean
           drop: 260,        // mm, pelvis drop
           shift: { x: 0, z: -80 },  // mm, pelvis shift = weight transfer
           ease: 'inOut' }
```

The stick's transform comes from `blade` and `top`: the shaft axis
runs from the blade's axis floor point toward `top`; the bottom hand
keeps its distance along the shaft (`gripPoints`). Today's fixed
placement (`stickPlacement()`, `PELVIS_DROP_MM`, `SPINE_LEAN_DEG`,
`SHOULDER_TWIST_DEG`) becomes the default pose of this model.

### Moves and how they really look

| Move | When | Key shape |
| --- | --- | --- |
| Carry | player is the carrier | Ball on the forehand side, blade cupped over it. Standing or slow: blade and ball swing side to side (~250 mm, ~2.5 Hz). Jog and faster: ball slightly ahead on the stick side, small amplitude. Head up. |
| Forehand pass | pass event, target on the stick side or ahead | Short sweep: blade starts ~300 mm behind the ball, drags it forward, releases beside the front foot, follow-through low and pointing at the receiver. ~250 ms before, ~200 ms after. |
| Backhand pass | target on the far side from the stick | Blade on the other side of the ball, short push across the body. |
| Receive | pass arrives at this player | Blade presented toward the incoming ball ~300 ms early, gives back ~150 mm over ~120 ms on contact ("soft hands"). |
| Wrist / sweep shot | shot below the speed threshold | Ball starts beside the back foot, long drag forward (~1 m) with the weight moving from the back to the front leg, release at the front foot, follow-through at the aim height (low aim, low blade; high aim, blade up to hip). |
| Slap shot | shot above the threshold (estimate 30 m/s) | Backswing with the blade at most waist high (higher is a foul), strike, long follow-through, strong torso rotation. |
| Defend | opponent has the ball within ~6 m | Lower stance, feet wide, stick on the floor reaching into the passing lane, one hand may leave the stick. |
| Ready | everything else | Today's stance. Fix its open issue here: less spine lean at jog / sprint. |

Later, not in the first pass: one-timer (receive and shoot in one
motion), shot block on one knee, face-off stance, drag move.

### Steps

1. `[lead]` **Pose as a parameter (no visual change).**
   `stick-pose.js`: `DEFAULT_POSE` in the data model above and
   `stickTransform(pose, hand)` -> position, yaw, tilt, mirror.
   `figure-stick.js`: `applyStanceAndStick(fig, stick, hand, pose =
   DEFAULT_POSE)` reads drop / lean / twist / shift from the pose.
   Tests first: `stickTransform(DEFAULT_POSE, h)` equals today's
   `stickPlacement(h)` within 1 mm / 0.1 deg for both hands; the
   existing `test-e2e/player-stick.spec.js` residuals stay green
   untouched.
2. `[lead]` **Events from the doc.** New three-free
   `web/src/authoring/figure-actions.js`:
   `actionsFor(frames, id)` -> sorted list of
   `{ kind: 'pass' | 'receive' | 'shot', tMs, dirYaw, speedMps, aim?,
   partnerId? }` plus `carryIntervals`. Reuse the pass and shot timing
   functions in `ball-pose.js`; do not re-derive release times.
   Tests: a two-frame pass yields one `pass` for the passer at the
   release time and one `receive` for the receiver at the arrival
   time; a shot yields one `shot` with its aim; a doc with no ball
   events yields nothing.
3. `[lead]` **Track sampling + pass and receive.** New
   `figure-action-tracks.js` (the data table) and
   `poseAt(actions, elapsedMs, hand, gaitSpeed)` in
   `figure-actions.js`: pick the active move, sample its keys with
   easing, blend in and out of `DEFAULT_POSE` over ~150 ms, mirror for
   'R'. `figures.js` `poseFigure()` passes the result to
   `applyStanceAndStick` and adds the pose to its cache key. While a
   move is active the figure's yaw turns toward `dirYaw` (within what
   the move allows) instead of the run direction.
   Tests: pose is continuous (no jump > 50 mm between samples 10 ms
   apart), equals `DEFAULT_POSE` far from any event, mirrored for 'R'.
   e2e (`seekTo`, never real ticks): at the release time the blade is
   within 150 mm of the ball; 300 ms later it points at the receiver.
4. `[lead]` **Ball on the blade.** One function decides where a
   carried ball is: `carryOffset(hand, pose)` in `ball-pose.js`,
   replacing the fixed `BALL_CARRY_OFFSET` in 3D so the ball sits in
   the blade's cup during carry, wind-up and receive. Pass and shot
   start points must come from the same function, so lane checks and
   the rendered flight agree. 2D keeps the simple offset. Extend
   `ball-pose` tests; rerun the pass / shot e2e specs.
5. `[small]` **Wrist shot and slap shot.** Two more tracks; the
   follow-through height interpolates on `shot.aimY`; the threshold
   between them is a named estimate. Tests: blade never above waist
   height (rule), follow-through height rises with `aimY`.
6. `[small]` **Carry, defend, head.** Carry track as a function of
   distance covered (like `clipPhase`), defend stance from "nearest
   opponent carrier within 6 m", head bone yaw toward the ball
   clamped to +/- 70 degrees (check the head bone's name in the GLB).
   Then: list the clip names in Universal Animation Library 2's free
   file; if it has backwards / strafe loops, add them through
   `extract_gait_clips.mjs` and choose the clip from the angle between
   facing and heading. If not: play the jog clip reversed at a
   shorter stride for backwards, and leave sideways as a turn.
7. `[small]` **Choice in the inspector.** Optional `style` on a pass
   or shot (`'wrist' | 'slap' | 'backhand'`), default automatic.
   This is a doc change: run it through `acceptDoc()`, the share
   encoder and their tests; unknown values fall back to automatic.

---

## A-BACK-042 - Goalie as a posable figure

Answers A-Q-002 (goalie as a figure: yes) and removes A-Q-003 (the
Meshy mesh and its unclear licence go away; so does the third-party
brand name printed on its chest, and 5.9 MB of boot download).

- **Body:** the same Quaternius rig and loader as the players
  (`player_figure.glb`), so the IK helpers are shared.
- **Gear:** new `generators/generate_goalie_gear.py` (same pattern
  as ball / goal / stick): helmet with cage, chest padding, knee
  pads, as small rigid meshes with their origin at the bone they
  attach to. Long sleeves and trousers through the kit tint (extend
  `player-figure-kit.mjs` with a goalie mask). No gloves needed:
  floorball goalies play bare-handed or with thin gloves, and they
  have no stick.
- **Kneeling:** floorball goalies play on their knees. The leg solver
  runs the other way round from the players': the knees are planted
  on the floor, the pelvis sits above them, the shins lie back.
- **Poses** as data in `goalie-poses.js` (hand targets, knee points,
  pelvis height, torso lean / twist, in goalie-local mm): `ready`
  (upright on the knees, hands out at hip height, palms forward),
  `butterfly`, `saveHighL/R`, `saveMidL/R`, `kickL/R` (leg extended
  along the floor), `smother`, `postL/R` (tight on the post for sharp
  angles), `throw`.
- **Coverage:** `coverage.js` raycasts the goalie mesh (221 rays
  against ~10k triangles). Replace the target with a proxy of capsules
  and boxes that follow the bones (torso, head, upper / lower arms,
  thighs, shins), with a three-free ray / capsule test. Faster, and
  correct for every pose. Mode B's `goalie-proxy.js` (cylinder + box)
  can use the same proxy later.

Steps:

1. `[small]` **Baseline.** Record goal coverage (%) for the current
   detailed goalie at 12 fixed ball positions into a test fixture.
2. `[lead]` **Proxy coverage.** `web/src/goalie-proxy-math.js`
   (ray / capsule, ray / box) with tests; coverage uses it for the
   current goalie with a hand-fitted kneeling proxy; numbers within
   5 points of the baseline at each position.
3. `[lead]` **Kneeling rig.** Pose solver + `ready` pose on the
   figure body, no gear, behind a third entry in the goalie model
   dropdown. Look-shots for review.
4. `[lead]` **Gear generator** and attachment; goalie kit colours
   from `tokens.js`.
5. `[small]` **Pose table.** The remaining poses, selectable in the
   inspector as a per-frame goalie pose (doc: `scheme.goalies.A.pose`,
   through `acceptDoc()` and share). Proxy follows the bones.
6. `[small]` **Switch the default**, delete `goalie.obj`,
   `goalie_02.*`, `generate_goalie.py` and the model dropdown; update
   README credits and the size budgets in `scripts/check-size.mjs`.

Scale: the proxy and the body share one height parameter. The target
user coaches U14, so make the height a setting (adult default) rather
than a constant: it changes what coverage says.

---

## A-BACK-043 - Goalie behaviour

Blocked by S-BACK-024 (ball and goalies: doc as the only source of
truth) and A-BACK-042.

- **Auto position** (per goalie, opt-in flag in the doc): stand on
  the line from the ball to the goal centre, at a depth that shrinks
  toward the post at sharp angles (estimate; expose the depth), facing
  the ball. Deterministic: computed from the ball position 150 ms
  earlier (reaction delay, estimate) and limited to the goal area,
  not integrated frame by frame.
- **Save reaction** to each shot: pick the pose from where the aim
  point lies relative to the goalie (left / right, high / mid / low),
  start after the reaction delay, reach it by the ball's arrival if
  the flight is long enough, otherwise arrive late and visibly short.
  The outcome is not decided here: `shotVerdict()` in `insights.js`
  stays the single judge. Blocked -> the save reaches the ball; open
  -> the goalie moves toward it and misses.
- **After the save:** smother when the ball is low and close, else
  back to `ready`.

Steps: (1) `[lead]` `goalie-brain.js` `goalieStateAt(frames, key,
elapsedMs)` with tests (position on the bisector, reaction timing,
pose choice per aim cell, late on a close fast shot); (2) `[small]`
wire to the rig and the proxy; (3) `[small]` inspector toggle "Auto
(follow ball)" and depth slider; (4) `[small]` e2e via `seekTo()`.

---

## What would make this better than estimates

Reference material from the user: 3 to 5 photos or short clips per
move (carry, pass, wrist shot, slap shot, goalie ready stance and a
save), ideally side-on. With those, the track numbers stop being
guesses. Not planned: lifting poses from video with the Mode B pose
detector (2D keypoints do not give reliable 3D joint angles).
