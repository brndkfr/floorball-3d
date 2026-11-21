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
import { GOAL_Z, BALL_CARRY_OFFSET, makeShot } from './authoring/ball-pose.js';
import { goalieZoneOf } from './goalie-zones.js';
import { kataTargets, expectedAction, shotAngleDeg } from './kata.js';
import { idealGoaliePose } from './shooter-view.js';

const ATTACKER = { team: 2, number: '9' };
const SOLO_CAST = Object.freeze({ a: ATTACKER });

// A frame spec is either { ball, ms, note } (one attacker, `a`, carrying the
// ball: lessons 1, 2, 5) or, for a lesson with a `cast` (lessons 3, 4),
// { players: { key: { x, z } }, carrier: key, ms, note } or, for a shot by
// the frame before's carrier, { players, shot: { aimX }, ms, note }.
function frameCast(spec) {
  if (spec.ball) return { players: { a: { x: spec.ball.x - BALL_CARRY_OFFSET.x, z: spec.ball.z - BALL_CARRY_OFFSET.z } }, carrier: 'a' };
  return { players: spec.players, carrier: spec.shot ? null : spec.carrier, shot: spec.shot };
}

export const LESSONS = Object.freeze({
  // 1. Shooting line and area: the ball stands still in the danger zone
  // while the captions take placement, depth and axis one at a time, then
  // it moves slowly across and all three follow it together.
  line: {
    n: 1,
    goal: 'A',
    title: { en: 'Shooting line and area', de: 'Schusslinie und Schussfläche' },
    frames: [
      { ball: { x: 4500, z: 10000 }, ms: 2500, note: {
        en: 'Shooting line: from the ball to the middle of the goal. First, placement: stand on that line.',
        de: 'Schusslinie: vom Ball zur Tormitte. Erstens, Ausrichtung: auf dieser Linie stehen.' } },
      { ball: { x: 4500, z: 10000 }, ms: 2500, note: {
        en: 'Second, depth: step forward along the line. The closer you stand to the ball, the smaller the goal looks to the shooter.',
        de: 'Zweitens, Tiefe: auf der Linie nach vorne. Je näher du am Ball stehst, desto kleiner wirkt das Tor für den Schützen.' } },
      { ball: { x: 4500, z: 10000 }, ms: 2500, note: {
        en: 'Third, axis: knees and chest square to the ball, so the whole body is in the path of the shot.',
        de: 'Drittens, Achse: Knie und Brust frontal zum Ball, damit der ganze Körper im Weg des Schusses steht.' } },
      { ball: { x: 4500, z: 10000 }, ms: 3000, note: {
        en: 'Now the ball moves. Placement, depth and axis follow it together.',
        de: 'Jetzt bewegt sich der Ball. Ausrichtung, Tiefe und Achse gehen gemeinsam mit.' } },
      { ball: { x: -2500, z: 9000 }, ms: 3000, note: {
        en: 'Shooting area: the triangle from the ball to both posts. On the line, forward and square, the body fills as much of it as it can.',
        de: 'Schussfläche: das Dreieck vom Ball zu beiden Pfosten. Auf der Linie, vorne und frontal, füllt der Körper so viel davon wie möglich.' } },
    ],
  },

  // 2. Through the zones: one attacker carries the ball from the attention
  // zone down the right side into the danger zone and behind the goal.
  zones: {
    n: 2,   // the lesson's number in the plan's list of five (A-BACK-049)
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

  // 3. Pass or shot: the same 2-on-1 twice. First the defender takes the
  // carrier, so the pass to the free attacker is coming; then the defender
  // closes the passing lane, so the carrier shoots. Shots are aimed at the
  // middle of the goal (aimX 0), the line the goalie stands on.
  passOrShot: {
    n: 3,
    goal: 'A',
    title: { en: 'Pass or shot', de: 'Pass oder Schuss' },
    cast: { a: { team: 2, number: '9' }, b: { team: 2, number: '7' }, d: { team: 1, number: '4' } },
    frames: [
      { players: { a: { x: 4500, z: 19000 }, b: { x: -4000, z: 19500 }, d: { x: 500, z: 12000 } }, carrier: 'a', ms: 2500, note: {
        en: 'A 2-on-1 is coming. Attention zone: centred, deep, knees parallel. Read the defender: pass or shot?',
        de: 'Ein 2-gegen-1 kommt. Attention-Zone: mittig, tief, Knie parallel. Lies den Verteidiger: Pass oder Schuss?' } },
      { players: { a: { x: 4000, z: 12500 }, b: { x: -3500, z: 12000 }, d: { x: 2500, z: 10500 } }, carrier: 'a', ms: 2000, note: {
        en: 'The defender goes to the carrier and the second attacker is free: a pass is coming. On the line but back, knees parallel, ready to push across.',
        de: 'Der Verteidiger geht zum Ballführer, der zweite Angreifer ist frei: ein Pass kommt. Auf der Linie, aber hinten, Knie parallel, bereit zum Verschieben.' } },
      { players: { a: { x: 3500, z: 10500 }, b: { x: -3000, z: 9000 }, d: { x: 3000, z: 10000 } }, carrier: 'b', ms: 1500, note: {
        en: 'The pass is across: push over with it, then forward and square to the new shooter.',
        de: 'Der Pass ist drüben: mitschieben, dann nach vorne und frontal zum neuen Schützen.' } },
      { players: { a: { x: 3000, z: 9000 }, b: { x: -2800, z: 8500 }, d: { x: 2800, z: 9500 } }, shot: { aimX: 0 }, ms: 3000, note: {
        en: 'Again: the same 2-on-1 from the same start.',
        de: 'Noch einmal: dasselbe 2-gegen-1 vom selben Start.' } },
      { players: { a: { x: 4500, z: 19000 }, b: { x: -4000, z: 19500 }, d: { x: 500, z: 12000 } }, carrier: 'a', ms: 2500, note: {
        en: 'Same start, same stance in the attention zone. Watch the defender again.',
        de: 'Gleicher Start, gleiche Haltung in der Attention-Zone. Wieder auf den Verteidiger achten.' } },
      { players: { a: { x: 4000, z: 12500 }, b: { x: -3500, z: 12000 }, d: { x: -500, z: 11500 } }, carrier: 'a', ms: 2000, note: {
        en: 'This time the defender sits in the passing lane: the carrier will shoot. Forward on the shooting line, square to the ball.',
        de: 'Diesmal steht der Verteidiger in der Passlinie: der Ballführer schiesst. Nach vorne auf die Schusslinie, frontal zum Ball.' } },
      { players: { a: { x: 3600, z: 10500 }, b: { x: -3500, z: 11000 }, d: { x: -600, z: 11000 } }, shot: { aimX: 0 }, ms: 3000, note: {
        en: 'The same 2-on-1, two reads. Pass expected: stay back, knees parallel. Shot expected: forward and square.',
        de: 'Dasselbe 2-gegen-1, zwei Lesarten. Pass erwartet: hinten bleiben, Knie parallel. Schuss erwartet: nach vorne und frontal.' } },
    ],
  },

  // 4. Most dangerous option or most likely action: the carrier in the
  // danger zone could shoot (likely), the free attacker coming in close on
  // the far side is the bigger threat (dangerous). Played twice: first the
  // far-side attacker is free and gets the pass, then the defender covers
  // them and the carrier shoots.
  options: {
    n: 4,
    goal: 'A',
    title: { en: 'Most dangerous or most likely', de: 'Gefährlichste oder wahrscheinlichste' },
    cast: { a: { team: 2, number: '9' }, b: { team: 2, number: '7' }, d: { team: 1, number: '4' } },
    frames: [
      { players: { a: { x: 2500, z: 14000 }, b: { x: -4500, z: 12000 }, d: { x: 4000, z: 11500 } }, carrier: 'a', ms: 2500, note: {
        en: 'Two threats. Most likely: the carrier shoots from here. Most dangerous: the free attacker coming in on the far side, close to the goal.',
        de: 'Zwei Gefahren. Am wahrscheinlichsten: der Ballführer schiesst von hier. Am gefährlichsten: der freie Angreifer auf der anderen Seite, nahe am Tor.' } },
      { players: { a: { x: 2000, z: 11000 }, b: { x: -3500, z: 8000 }, d: { x: 2500, z: 9500 } }, carrier: 'a', ms: 2000, note: {
        en: 'The far-side attacker is free and close: the dangerous pass is open. Do not commit forward. On the line, back, knees parallel, ready to push across.',
        de: 'Der Angreifer auf der anderen Seite ist frei und nah: der gefährliche Pass ist offen. Nicht nach vorne festlegen. Auf der Linie, hinten, Knie parallel, bereit zum Verschieben.' } },
      { players: { a: { x: 1800, z: 10000 }, b: { x: -3000, z: 6500 }, d: { x: 2000, z: 9800 } }, carrier: 'b', ms: 1500, note: {
        en: 'The pass comes: push across and square up to the new shooter.',
        de: 'Der Pass kommt: hinüberschieben und frontal zum neuen Schützen stellen.' } },
      { players: { a: { x: 1800, z: 9500 }, b: { x: -2800, z: 6300 }, d: { x: 2000, z: 9300 } }, shot: { aimX: 0 }, ms: 3000, note: {
        en: 'Again, but this time the defender takes the far-side attacker.',
        de: 'Noch einmal, aber diesmal nimmt der Verteidiger den Angreifer auf der anderen Seite.' } },
      { players: { a: { x: 2500, z: 14000 }, b: { x: -4500, z: 12000 }, d: { x: -3000, z: 11000 } }, carrier: 'a', ms: 2500, note: {
        en: 'The dangerous pass is covered. What is left is the shot.',
        de: 'Der gefährliche Pass ist zugestellt. Übrig bleibt der Schuss.' } },
      { players: { a: { x: 2000, z: 11000 }, b: { x: -3500, z: 8000 }, d: { x: -3000, z: 8600 } }, carrier: 'a', ms: 2000, note: {
        en: 'The most likely action is now also the most dangerous one: forward on the shooting line, square to the ball.',
        de: 'Die wahrscheinlichste Aktion ist jetzt auch die gefährlichste: nach vorne auf die Schusslinie, frontal zum Ball.' } },
      { players: { a: { x: 1700, z: 10000 }, b: { x: -3500, z: 7500 }, d: { x: -3100, z: 8100 } }, shot: { aimX: 0 }, ms: 3000, note: {
        en: 'When the two differ and the dangerous option is open, stay back and ready to move. When it is closed, play the likely shot.',
        de: 'Gehen beide auseinander und die gefährliche Option ist offen: hinten bleiben, bereit zum Verschieben. Ist sie zu, den wahrscheinlichen Schuss spielen.' } },
    ],
  },

  // 5. Behind the goal: the carrier goes round behind goal A from the right
  // to the left and comes out in front again on the left.
  behind: {
    n: 5,
    goal: 'A',
    title: { en: 'Behind the goal', de: 'Hinter dem Tor' },
    frames: [
      { ball: { x: 5000, z: 3800 }, ms: 2000, note: {
        en: 'The ball is level with the goal line: back onto the line at the near post, knees parallel to the goal line.',
        de: 'Der Ball ist auf Höhe der Torlinie: zurück auf die Linie an den nahen Pfosten, Knie parallel zur Torlinie.' } },
      { ball: { x: 2500, z: 1800 }, ms: 2500, note: {
        en: 'Behind the goal: play the line. Feet in the goal, and glance over the shoulder to the slot for the pass.',
        de: 'Hinter dem Tor: Linie spielen. Füsse im Tor, und über die Schulter zum Slot schauen, ob ein Pass kommt.' } },
      { ball: { x: -2500, z: 1800 }, ms: 2000, note: {
        en: 'The ball has crossed: slide along the line to the other post, never through the middle of the goal.',
        de: 'Der Ball hat die Seite gewechselt: entlang der Linie an den anderen Pfosten, nie durch die Tormitte.' } },
      { ball: { x: -5000, z: 3800 }, ms: 2000, note: {
        en: 'Beside the goal on the other side: still at the post, still parallel. Keep checking the slot.',
        de: 'Neben dem Tor auf der anderen Seite: weiter am Pfosten, weiter parallel. Den Slot im Blick behalten.' } },
      { ball: { x: -5500, z: 7000 }, ms: 3000, note: {
        en: 'The ball comes out in front: leave the line, step forward onto the shooting line and square up.',
        de: 'Der Ball kommt vors Tor: weg von der Linie, nach vorne auf die Schusslinie und frontal stellen.' } },
    ],
  },
});

export const LESSON_KEYS = Object.freeze(Object.keys(LESSONS));

// The Lessons shelf in the Library: one row per shipped lesson in the
// module's order, titled in `lang` (English when there is no title in it).
export function lessonShelf(lang = 'en') {
  return LESSON_KEYS
    .map((key) => {
      const l = LESSONS[key];
      return {
        key,
        n: l.n,
        title: l.title[lang] ?? l.title.en,
        frames: l.frames.length,
        seconds: l.frames.reduce((s, f) => s + f.ms, 0) / 1000,
      };
    })
    .sort((a, b) => a.n - b.n);
}

const faceToward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);   // rotation.y, local +z forward

export function buildLesson(key, lang = 'en') {
  const lesson = LESSONS[key];
  if (!lesson) return null;
  const { goal } = lesson;
  const goalCenter = { x: 0, z: GOAL_Z[goal] };

  const doc = emptyDoc();
  doc.meta = emptyMeta(lesson.title[lang] ?? lesson.title.en);
  const cast = lesson.cast ?? SOLO_CAST;
  const ids = Object.fromEntries(Object.keys(cast).map((k) => [k, newId('p')]));
  doc.frames = lesson.frames.map((spec) => {
    const { players: at, carrier, shot } = frameCast(spec);
    let ball;
    if (shot) {
      const s = makeShot(goal, { aimX: shot.aimX ?? 0 });
      ball = { x: s.rest.x, z: s.rest.z, shot: s.shot };
    } else {
      ball = { x: at[carrier].x + BALL_CARRY_OFFSET.x, z: at[carrier].z + BALL_CARRY_OFFSET.z, carrier: ids[carrier] };
    }
    const players = {};
    for (const [k, c] of Object.entries(cast)) {
      const p = at[k];
      const id = ids[k];
      // attackers face the goal, defenders the ball
      players[id] = { id, team: c.team, number: c.number, x: p.x, z: p.z, angle: faceToward(p, c.team === ATTACKER.team ? goalCenter : ball) };
    }
    return {
      id: newId('f'),
      duration: spec.ms,
      note: { ...spec.note },
      scheme: {
        players,
        balls: { main: ball },
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
