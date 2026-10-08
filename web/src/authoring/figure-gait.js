// Pure gait math for the animated player figures (A-BACK-032). three-free
// so it runs under node --test; figures.js drives the AnimationMixer with it.
//
// Everything is a function of the doc and the playback time, never of
// wall-clock deltas, so seekTo() / the MP4 export render the same pose for
// the same time. The cycle position of a locomotion clip comes from the
// distance the chip has covered (clipPhase), so feet don't slide when a
// chip moves slower or faster than the clip was recorded at.

import { bezierPos, segmentControls } from './bezier.js';

// Quaternius Universal Animation Library (Standard), 30 fps clips.
// strideM = distance one loop covers, read from the root motion of the
// _RM export (Walk 1.3 m, Jog 5.0 m, Sprint 5.5 m per loop).
const clip = (name, keys, strideM) => {
  const durationS = (keys - 1) / 30;
  return strideM
    ? { name, durationS, strideM, speedMps: strideM / durationS }
    : { name, durationS };
};
export const GAIT_CLIPS = {
  idle: clip('Idle_Loop', 76),
  walk: clip('Walk_Loop', 41, 1.3),
  jog: clip('Jog_Fwd_Loop', 29, 5.0),
  sprint: clip('Sprint_Loop', 21, 5.5),
};

// Crossfade bands between neighbouring gaits, m/s. Estimates: walk up to
// ~1.6 m/s, jog to ~6 m/s, sprint above ~7 m/s (floorball top speeds are
// ~8-9 m/s); only one boundary is ever active, so at most two clips blend.
const BANDS = [
  ['idle', 'walk', 0.15, 0.5],
  ['walk', 'jog', 1.6, 2.4],
  ['jog', 'sprint', 6.0, 7.0],
];

export function gaitWeights(speedMps) {
  const w = { idle: 0, walk: 0, jog: 0, sprint: 0 };
  const v = Math.max(0, speedMps || 0);
  for (const [lo, hi, from, to] of BANDS) {
    if (v < from) { w[lo] = 1; return w; }
    if (v < to) {
      const k = (v - from) / (to - from);
      w[lo] = 1 - k;
      w[hi] = k;
      return w;
    }
  }
  w.sprint = 1;
  return w;
}

// Clip time (s) for a locomotion clip after covering distanceM metres.
export function clipPhase(distanceM, c) {
  const loops = distanceM / c.strideM;
  const frac = loops - Math.floor(loops);
  return frac * c.durationS;
}

const SAMPLES = 32; // per segment, for arc length

function segmentPoint(pa, pb, ctl, t) {
  return [bezierPos(pa.x, pb.x, ctl[0], ctl[2], t), bezierPos(pa.z, pb.z, ctl[1], ctl[3], t)];
}

function arcLength(pa, pb, ctl, t1) {
  const n = Math.max(2, Math.ceil(SAMPLES * t1));
  let len = 0;
  let [px, pz] = segmentPoint(pa, pb, ctl, 0);
  for (let i = 1; i <= n; i++) {
    const [x, z] = segmentPoint(pa, pb, ctl, (t1 * i) / n);
    len += Math.hypot(x - px, z - pz);
    px = x; pz = z;
  }
  return len;
}

const REST = Object.freeze({ speedMps: 0, heading: 0, distanceM: 0 });

// Motion of chip `id` at playback time elapsedMs, mirroring playback.js's
// applyPose(): { speedMps, heading (rotation.y convention, atan2(dx, dz)),
// distanceM covered since t = 0 }. mm per ms == m per s.
export function chipMotionAt(frames, id, elapsedMs) {
  if (!frames || frames.length < 2) return REST;
  let acc = 0;
  let distMm = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    const d = frames[i].duration;
    const pa = frames[i].scheme.players?.[id];
    const pb = frames[i + 1].scheme.players?.[id] || pa;
    const ctl = pa ? segmentControls(pa, pb) : null;
    if (elapsedMs < acc + d) {
      if (!pa) return REST;
      const t = (elapsedMs - acc) / d;
      distMm += arcLength(pa, pb, ctl, t);
      const h = 1e-4;
      const [x0, z0] = segmentPoint(pa, pb, ctl, Math.max(0, t - h));
      const [x1, z1] = segmentPoint(pa, pb, ctl, Math.min(1, t + h));
      const dt = (Math.min(1, t + h) - Math.max(0, t - h)) * d; // ms
      const vx = (x1 - x0) / dt;
      const vz = (z1 - z0) / dt;
      const speed = Math.hypot(vx, vz);
      return {
        speedMps: speed,
        heading: speed > 0 ? Math.atan2(vx, vz) : 0,
        distanceM: distMm / 1000,
      };
    }
    if (pa) distMm += arcLength(pa, pb, ctl, 1);
    acc += d;
  }
  return REST;
}

// Figure yaw (world): the authored chip angle when standing, the run
// direction once moving (blended over a small speed band, short way round).
export function facingYaw(chipAngle, heading, speedMps) {
  const k = Math.min(Math.max((speedMps - 0.2) / 0.6, 0), 1);
  const delta = Math.atan2(Math.sin(heading - chipAngle), Math.cos(heading - chipAngle));
  return chipAngle + delta * k;
}
