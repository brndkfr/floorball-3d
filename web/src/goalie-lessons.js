// Goalie lessons (A-BACK-049): short plays shipped with the app, built in
// code from a ball path and captions. Pure and DOM-free so it is
// Node-testable (test/goalie-lessons.test.js).
//
// A lesson only describes the attack. The goalie in each frame is placed
// by the app's own rules: idealGoaliePose() for the ball's zone and the
// expected action, the same pose the Auto position button picks, so the
// KATA card reads ok at every keyframe. If the zone borders or the KATA
// targets change, the lessons follow.
//
// Positions are mm (x across the rink, 0 = centre; z along it, goal A's
// line at GOAL_Z.A). Ball paths and frame durations are estimates picked
// by eye for a readable pace, not taken from the module.

import { emptyDoc, emptyMeta, newId } from './authoring/doc.js';
import { GOAL_Z, BALL_CARRY_OFFSET } from './authoring/ball-pose.js';
import { goalieZoneOf } from './goalie-zones.js';
import { kataTargets, expectedAction, shotAngleDeg } from './kata.js';
import { idealGoaliePose } from './shooter-view.js';

const ATTACKER = { team: 2, number: '9' };

export const LESSONS = Object.freeze({
  // 2. Through the zones: one attacker carries the ball from the attention
  // zone down the right side into the danger zone and behind the goal.
  zones: {
    goal: 'A',
    title: { en: 'Through the zones', de: 'Durch die Zonen' },
    frames: [
      { ball: { x: 3000, z: 24000 }, ms: 3000, note: {
        en: 'Attention zone: stay patient. Centred and deep in the goal, knees parallel to the goal line.',
        de: 'Attention-Zone: geduldig bleiben. Mittig und tief im Tor, Knie parallel zur Torlinie.' } },
      { ball: { x: 5000, z: 14000 }, ms: 2500, note: {
        en: 'Danger zone: step forward onto the shooting line and square up to the ball.',
        de: 'Danger-Zone: nach vorne auf die Schusslinie und frontal zum Ball.' } },
      { ball: { x: 4500, z: 8000 }, ms: 2000, note: {
        en: 'The ball comes closer: move with it, stay on the shooting line and square.',
        de: 'Der Ball kommt näher: mitgehen, auf der Schusslinie und frontal bleiben.' } },
      { ball: { x: 4000, z: 3000 }, ms: 1500, note: {
        en: 'Passing-first zone: back onto the line, at the ball-side post, knees parallel.',
        de: 'Passing-First-Zone: zurück auf die Linie, an den Pfosten auf der Ballseite, Knie parallel.' } },
      { ball: { x: 1500, z: 1700 }, ms: 3000, note: {
        en: 'Behind the goal: play the line, feet in the goal, eyes on the slot for the pass.',
        de: 'Hinter dem Tor: Linie spielen, Füsse im Tor, Blick zum Slot für den Pass.' } },
    ],
  },
});

export const LESSON_KEYS = Object.freeze(Object.keys(LESSONS));

const faceToward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);   // rotation.y, local +z forward

export function buildLesson(key, lang = 'en') {
  const lesson = LESSONS[key];
  if (!lesson) return null;
  const { goal } = lesson;
  const goalCenter = { x: 0, z: GOAL_Z[goal] };

  const doc = emptyDoc();
  doc.meta = emptyMeta(lesson.title[lang] ?? lesson.title.en);
  const id = newId('p');
  doc.frames = lesson.frames.map((spec) => {
    const ball = { ...spec.ball };
    const p = { x: ball.x - BALL_CARRY_OFFSET.x, z: ball.z - BALL_CARRY_OFFSET.z };
    return {
      id: newId('f'),
      duration: spec.ms,
      note: { ...spec.note },
      scheme: {
        players: { [id]: { id, ...ATTACKER, x: p.x, z: p.z, angle: faceToward(p, goalCenter) } },
        balls: { main: { x: ball.x, z: ball.z, carrier: id } },
        shapes: [],
        cones: [],
        goalies: {},
      },
    };
  });

  // The goalie, frame by frame, from the zone rules. Free dimensions
  // (awareness) keep the previous frame's value.
  let goalie = { x: goalCenter.x, z: goalCenter.z + (goal === 'B' ? -250 : 250), yaw: goal === 'B' ? Math.PI : 0 };
  let startMs = 0;
  for (const frame of doc.frames) {
    const ball = frame.scheme.balls.main;
    const targets = kataTargets(goalieZoneOf(ball, goal), expectedAction(doc.frames, startMs), shotAngleDeg(ball, goal, goalCenter));
    goalie = idealGoaliePose({ ball, goal, goalCenter, goalie, targets });
    frame.scheme.goalies[goal] = { x: goalie.x, z: goalie.z, angle: goalie.yaw };
    startMs += frame.duration;
  }
  doc.currentFrame = 0;
  doc.autoGoalie = goal;   // playback moves this goalie by the rules between keyframes (goalie-track.js)
  return doc;
}
