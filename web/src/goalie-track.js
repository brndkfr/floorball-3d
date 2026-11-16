// Live goalie (A-BACK-049, first step of A-BACK-051): for docs with
// `autoGoalie` set (the shipped lessons), playback moves that goalie by
// the app's rules at every moment, not only at keyframes. Pure and
// three-free so it is Node-testable (test/goalie-track.test.js).
//
// The ideal pose (idealGoaliePose for the ball's zone and the expected
// action) jumps where the zone or the action changes, so the goalie
// follows it at a limited speed and turn rate instead of teleporting.
// The track is a function of the frames alone, sampled once, so scrubbing,
// playback and the video export all show the same motion.

import { GOAL_Z, ballPoseAt } from './authoring/ball-pose.js';
import { goalieZoneOf } from './goalie-zones.js';
import { kataTargets, expectedAction, shotAngleDeg } from './kata.js';
import { idealGoaliePose } from './shooter-view.js';

// ESTIMATES, picked so the motion reads as a goalie shuffling and turning
// in the crease, not taken from a source.
export const GOALIE_MOVE = Object.freeze({ maxMps: 3, maxTurnDps: 360, stepMs: 40 });

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const playLength = (frames) => frames.slice(0, -1).reduce((s, f) => s + f.duration, 0);

// The ball's floor position at `ms` into the play, as playback puts it.
export function ballAt(frames, ms) {
  let acc = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const d = frames[i].duration;
    if (ms < acc + d) {
      const p = ballPoseAt(frames[i].scheme, frames[i + 1].scheme, Math.max(0, (ms - acc) / d), d);
      if (p) return { x: p.x, z: p.z };
    }
    acc += d;
  }
  const b = frames.at(-1).scheme.balls?.main;
  return b ? { x: b.x, z: b.z } : null;
}

// Fixed goals stand centred on x = 0 (the goal centre KATA measures from).
const goalCenterOf = (goal) => ({ x: 0, z: GOAL_Z[goal] });

function idealAt(frames, goal, ms, goalie) {
  const ball = ballAt(frames, ms);
  if (!ball) return goalie;
  const goalCenter = goalCenterOf(goal);
  const targets = kataTargets(goalieZoneOf(ball, goal), expectedAction(frames, ms), shotAngleDeg(ball, goal, goalCenter));
  return idealGoaliePose({ ball, goal, goalCenter, goalie, targets });
}

function stepToward(cur, to, maxStep, maxTurn) {
  const dx = to.x - cur.x, dz = to.z - cur.z;
  const dist = Math.hypot(dx, dz);
  const k = dist > maxStep ? maxStep / dist : 1;
  const dyaw = wrap(to.yaw - cur.yaw);
  const turn = Math.max(-maxTurn, Math.min(maxTurn, dyaw));
  return { x: cur.x + dx * k, z: cur.z + dz * k, yaw: wrap(cur.yaw + turn) };
}

// { goal, stepMs, samples: [{ x, z, yaw }] } from t = 0 to the end of the
// play; samples[0] is the first frame's stored goalie.
export function goalieTrack(frames, goal, move = GOALIE_MOVE) {
  const { stepMs } = move;
  const maxStep = move.maxMps * stepMs;   // m/s * ms = mm
  const maxTurn = (move.maxTurnDps * Math.PI / 180) * stepMs / 1000;
  const g0 = frames[0]?.scheme.goalies?.[goal];
  const rest = { x: 0, z: GOAL_Z[goal] + (goal === 'B' ? -250 : 250), yaw: goal === 'B' ? Math.PI : 0 };
  let cur = g0 ? { x: g0.x, z: g0.z, yaw: g0.angle || 0 } : idealAt(frames, goal, 0, rest);
  const samples = [cur];
  const end = playLength(frames);
  for (let t = stepMs; t < end + stepMs; t += stepMs) {
    cur = stepToward(cur, idealAt(frames, goal, t, cur), maxStep, maxTurn);
    samples.push(cur);
  }
  return { goal, stepMs, samples };
}

// The tracked pose at `ms`, linear between samples, held at both ends.
export function goalieTrackAt({ stepMs, samples }, ms) {
  const f = Math.max(0, ms) / stepMs;
  const i = Math.floor(f);
  if (i >= samples.length - 1) return { ...samples.at(-1) };
  const a = samples[i], b = samples[i + 1], k = f - i;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + wrap(b.yaw - a.yaw) * k };
}

// Playback asks every frame; the track is rebuilt only when the play
// changed (anything the ball, the carriers or the timing depend on).
let cache = { key: null, track: null };
export function cachedGoalieTrack(frames, goal) {
  const key = goal + JSON.stringify(frames.map((f) => [f.duration, f.scheme.players, f.scheme.balls, f.scheme.goalies?.[goal]]));
  if (cache.key !== key) cache = { key, track: goalieTrack(frames, goal) };
  return cache.track;
}
