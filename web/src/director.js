// Director camera (A-BACK-049): named camera shots for the lessons, computed
// live from the goalie's and the ball's positions, and the timeline that
// says which shot is on at which play time. Pure and three-free so it is
// Node-testable (test/director.test.js). Millimetres; a pose is
// { x, y, z, yaw, pitch } in the project's convention (yaw 0 looks along
// +Z, pitch < 0 looks down). scene.js setCameraLook() adds the fixed +PI
// yaw offset when the pose is applied, see CLAUDE.md "Coordinate
// conventions", so nothing here deals with it.
//
// A frame names its shot with `cam: '<name>'` (lesson frames only, never
// the `camera` keyframe of the recorder). The shot holds until a later
// frame names another. The pose is a function of the frames and the play
// time only, so scrubbing, playback and the video export agree.

import { lerpPose, easeInOut, lessonPose } from './camera-presets.js';
import { kataBall } from './kata.js';

export const DIRECTOR_SHOTS = Object.freeze(['wide', 'goalieEyes', 'shooterEyes', 'sideKnee', 'followBall', 'pushIn']);
export const DEFAULT_SHOT = 'wide';
export const SHOT_LABELS = Object.freeze({
  wide: { en: 'Wide', de: 'Totale' },
  goalieEyes: { en: 'Goalie eyes', de: 'Goalie-Augen' },
  shooterEyes: { en: 'Shooter eyes', de: 'Schützen-Augen' },
  sideKnee: { en: 'Side, knee height', de: 'Seite, Kniehöhe' },
  followBall: { en: 'Follow the ball', de: 'Ball folgen' },
  pushIn: { en: 'Push in', de: 'Heranfahren' },
});

// Estimates, chosen by eye like the presets in camera-presets.js.
export const TRANSITION_MS = 900;   // blend between two shots
const GOALIE_EYE = { back: -600, height: 1250 };  // eyes: mm behind the goalie centre (negative: in front of it, clear of the helmet; ESTIMATE, check in the look-shots); height mm (a kneeling goalie)
const SHOOTER_EYE = { back: 900, height: 1500 };   // behind the ball, mm; height mm
const SIDE_KNEE = { dist: 3500, height: 450 };     // side distance from the goalie, mm (ESTIMATE, a close-up of the goalie); knee height mm
const FOLLOW = { back: 4500, height: 2200, ahead: 2500 };   // behind the ball, up, look-at point towards the goal
const PUSH_IN = { side: 2300, front: 600, height: 1000 };   // close to the goalie and the ball

const aim = (from, to) => {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return { ...from, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
};

// The unit floor vector pointing from `from` to `to`, or `fallback`.
function unit(from, to, fallback) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  return len < 1 ? fallback : { x: dx / len, z: dz / len };
}

// The pose of one shot. `ctx` = { goal: 'A' | 'B', ball: { x, z },
// goalie: { x, z } }. Null for an unknown name or a missing actor.
// `ctx.shooter` (optional) is where the shooter stands once a shot is
// released; shooterEyes anchors to it instead of the live ball.
export function shotPose(name, { goal = 'A', ball, goalie, shooter } = {}) {
  if (name === 'wide') return lessonPose(goal);
  if (!ball || !goalie) return null;
  const out = { x: 0, z: goal === 'B' ? -1 : 1 };   // from the goal into the rink
  const away = unit(goalie, ball, out);               // from the goalie towards the ball
  const mid = { x: (ball.x + goalie.x) / 2, z: (ball.z + goalie.z) / 2 };
  // the side the lesson camera stands on: towards +x for goal A, -x for B
  const perp = { x: -away.z, z: away.x };
  const flip = (perp.x * (goal === 'B' ? -1 : 1) >= 0 ? 1 : -1);
  const side = { x: perp.x * flip, z: perp.z * flip };
  switch (name) {
    case 'goalieEyes':
      return aim({ x: goalie.x - away.x * GOALIE_EYE.back, y: GOALIE_EYE.height, z: goalie.z - away.z * GOALIE_EYE.back }, { x: ball.x, y: 150, z: ball.z });
    case 'shooterEyes': {
      const a = shooter ?? ball;
      const back = unit(goalie, a, out);
      return aim({ x: a.x + back.x * SHOOTER_EYE.back, y: SHOOTER_EYE.height, z: a.z + back.z * SHOOTER_EYE.back }, { x: goalie.x, y: 600, z: goalie.z });
    }
    case 'sideKnee':
      return aim({ x: goalie.x + side.x * SIDE_KNEE.dist, y: SIDE_KNEE.height, z: goalie.z + side.z * SIDE_KNEE.dist }, { x: goalie.x, y: SIDE_KNEE.height, z: goalie.z });
    case 'followBall':
      return aim(
        { x: ball.x + away.x * FOLLOW.back, y: FOLLOW.height, z: ball.z + away.z * FOLLOW.back },
        { x: ball.x - away.x * FOLLOW.ahead, y: 300, z: ball.z - away.z * FOLLOW.ahead });
    case 'pushIn':
      return aim(
        { x: mid.x + side.x * PUSH_IN.side + away.x * PUSH_IN.front, y: PUSH_IN.height, z: mid.z + side.z * PUSH_IN.side + away.z * PUSH_IN.front },
        { x: mid.x, y: 500, z: mid.z });
    default: return null;
  }
}

// True when any frame names a shot (the Director switch only means
// something then).
export const hasDirector = (frames) => !!frames?.some((f) => DIRECTOR_SHOTS.includes(f?.cam));

// [{ at, name }] in play-time order: each frame that names a shot, and the
// default shot from 0 when the first one comes later. Empty without any.
export function shotTimeline(frames) {
  const out = [];
  let at = 0;
  for (const f of frames ?? []) {
    if (DIRECTOR_SHOTS.includes(f.cam)) out.push({ at, name: f.cam });
    at += f.duration;
  }
  if (out.length && out[0].at > 0) out.unshift({ at: 0, name: DEFAULT_SHOT });
  return out;
}

// { cur, prev, since }: the shot on at `elapsed`, the one before it (or
// null) and the ms since the cur one started. Null without any shot.
export function shotAt(frames, elapsed) {
  const tl = shotTimeline(frames);
  if (!tl.length) return null;
  let i = 0;
  while (i + 1 < tl.length && tl[i + 1].at <= elapsed) i++;
  return { cur: tl[i].name, prev: i > 0 ? tl[i - 1].name : null, since: Math.max(0, elapsed - tl[i].at) };
}

// The camera pose at play time `elapsed`, or null (no shot named, or an
// actor missing). `ctx` = { goal, ballAt(ms) -> { x, z }, goalieAt(ms) ->
// { x, z } }. Within TRANSITION_MS of a change the pose blends from the
// previous shot, itself still following the live positions.
export function directorPoseAt(frames, elapsed, { goal, ballAt, goalieAt }) {
  const s = shotAt(frames, elapsed);
  if (!s) return null;
  const ball = ballAt(elapsed);
  const actors = { goal, ball, goalie: goalieAt(elapsed), shooter: kataBall(frames, elapsed, ball) };
  const pose = shotPose(s.cur, actors);
  if (!pose) return null;
  if (!s.prev || s.since >= TRANSITION_MS) return pose;
  const from = shotPose(s.prev, actors);
  return from ? lerpPose(from, pose, easeInOut(s.since / TRANSITION_MS)) : pose;
}

// Does the director drive the camera? `switchOn` is the viewer's Director
// switch, `forced` the video export (it always uses the director), and
// the frames must name a shot and the 3D camera be the active one.
export const directorActive = ({ switchOn, forced, frames, perspective }) =>
  !!perspective && !!(switchOn || forced) && hasDirector(frames);

// Back to the director after the viewer had the camera: the pose eases from
// where the camera stood to the director's pose over RESUME_MS (wall time).
export const RESUME_MS = 600;   // estimate
export function resumePose(from, pose, sinceMs) {
  const k = sinceMs / RESUME_MS;
  return k >= 1 ? pose : lerpPose(from, pose, easeInOut(k));
}
