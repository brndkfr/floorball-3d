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
import { GOAL_Z, BALL_CARRY_OFFSET, makeShot, savedShot, passPlan } from './authoring/ball-pose.js';
import { goalieZoneOf } from './goalie-zones.js';
import { kataTargets, expectedAction, shotAngleDeg } from './kata.js';
import { idealGoaliePose } from './shooter-view.js';

const ATTACKER = { team: 2, number: '9' };
const SOLO_CAST = Object.freeze({ a: ATTACKER });
const SHOOTER = Object.freeze({ x: 4500, z: 10000 });         // lesson 1's shooter, on the right of the danger zone (estimate)
const ZONES_SHOOTER = Object.freeze({ x: 4500, z: 9750 });       // lesson 2: where the attacker shoots from, in the danger zone (estimate)
// Lesson 3's 2-on-1 (positions mm, estimates picked by eye): the start, the defender on the carrier (a pass is coming), the pass across and the shot after it, and the defender in the passing lane (a shot is coming).
const PASS_START = Object.freeze({ a: { x: 4500, z: 19000 }, b: { x: -4000, z: 19500 }, d: { x: 500, z: 12000 } });
const PASS_READ = Object.freeze({ a: { x: 4000, z: 12500 }, b: { x: -3500, z: 12000 }, d: { x: 2500, z: 10500 } });
const PASS_ACROSS = Object.freeze({ a: { x: 3500, z: 10500 }, b: { x: -3000, z: 9000 }, d: { x: 3000, z: 10000 } });
const PASS_SHOT = Object.freeze({ a: { x: 3000, z: 9000 }, b: { x: -2800, z: 8500 }, d: { x: 2800, z: 9500 } });
const SHOT_READ = Object.freeze({ a: { x: 4000, z: 12500 }, b: { x: -3500, z: 12000 }, d: { x: -500, z: 11500 } });
const SHOT_SHOT = Object.freeze({ a: { x: 3600, z: 10500 }, b: { x: -3500, z: 11000 }, d: { x: -600, z: 11000 } });
const LATE_DX = 900;   // lesson 3: the goalie that read a shot is still on the first carrier's side when the pass arrives, mm (estimate)
const WRONG_DX = -700;                                         // lesson 1: the goalie stands this far off the line, mm (estimate: clear of the shot, inside the goal)
const SLOW_SHOT = Object.freeze({ speedMps: 6, releaseT: 0.15 });   // lesson 1: a readable flight, not the 25 m/s default (estimate)

// A frame spec is either { ball, ms, note } (one attacker, `a`, carrying the
// ball: lessons 1, 2, 5) or, for a lesson with a `cast` (lesson 3),
// { players: { key: { x, z } }, carrier: key, ms, note } or, for a shot by
// the frame before's carrier, { players, shot: { aimX }, ms, note }.
// Any frame may add `goalie: ['placement', 'depth', 'axis']` (a subset): only
// those KATA dimensions are applied, the rest stay at the default stance
// (deep, knees parallel, centred), and the frame is marked `goalieFixed` so
// the live goalie follows that pose instead of the rules. `goalieDx` (mm)
// moves that pose sideways: the goalie off the shooting line, in the "wrong
// first" frames of lesson 1. `goalieRead: 'shot'` (or 'pass') makes that
// pose the one for that expected action instead of the frame's own: a goalie
// that reads a pass as a shot (lesson 3's wrong run).
// Optional per frame, for a lesson that explains itself (lesson 1):
//   layers: ['line', ...]  quiet screen, only these rink layers (lesson-view.js; 'lane' is the pass lane)
//   cam: 'sideKnee'        director camera shot from this frame on (director.js)
//   shot: { aimX, scored: true }  a goal instead of a save
//   shot: { speedMps, releaseT }  a slow motion flight (the ball's pass settings)
// and for the lesson itself `intro` / `recap` cards (lesson-cards.js).
function frameCast(spec) {
  if (spec.ball) return { players: { a: { x: spec.ball.x - BALL_CARRY_OFFSET.x, z: spec.ball.z - BALL_CARRY_OFFSET.z } }, carrier: 'a' };
  return { players: spec.players, carrier: spec.shot ? null : spec.carrier, shot: spec.shot };
}

export const LESSONS = Object.freeze({
  // 1. Shooting line and area, as a showcase: a task card, then the same shot
  // twice from the same spot. First the goalie just stands in his goal and
  // the shot goes in ("what went wrong?"). Then the captions build the KATA
  // up one dimension at a time (placement, depth, axis; the frames with a
  // `goalie` hint, so the KATA rows turn green one by one), show the
  // shooting area, and the same shot is saved. Quiet screen (`layers`) and
  // the director camera (`cam`) keep the picture on what the caption says;
  // both shots fly slowly (`speedMps`), the estimate being a readable pace.
  line: {
    n: 1,
    goal: 'A',
    title: { en: 'Shooting line and area', de: 'Schusslinie und Schussfläche' },
    intro: {
      task: { en: 'Watch the goalie: where does it stand, and why?', de: 'Schau auf den Goalie: wo steht er, und warum?' },
    },
    recap: {
      title: { en: 'What to take away', de: 'Das nimmst du mit' },
      bullets: [
        { en: 'Placement: stand on the shooting line, from the ball to the middle of the goal.', de: 'Ausrichtung: auf der Schusslinie stehen, vom Ball zur Tormitte.' },
        { en: 'Depth: step forward along the line, the goal looks smaller to the shooter.', de: 'Tiefe: auf der Linie nach vorne, das Tor wirkt kleiner für den Schützen.' },
        { en: 'Axis: knees and chest square to the ball, the whole body in the path of the shot.', de: 'Achse: Knie und Brust frontal zum Ball, der ganze Körper im Weg des Schusses.' },
      ],
    },
    frames: [
      { players: { a: SHOOTER }, carrier: 'a', ms: 3000, layers: [], cam: 'shooterEyes', goalie: [], goalieDx: WRONG_DX, note: {
        en: 'The same shot twice. First, the goalie just stands in his goal. Watch the shot.',
        de: 'Derselbe Schuss zweimal. Zuerst steht der Goalie einfach im Tor. Schau dir den Schuss an.' } },
      { players: { a: SHOOTER }, shot: { aimX: 0, scored: true, ...SLOW_SHOT }, ms: 2500, layers: [], cam: 'shooterEyes', goalie: [], goalieDx: WRONG_DX, note: {
        en: 'Goal. What went wrong?',
        de: 'Tor. Was ist schiefgelaufen?' } },
      { players: { a: SHOOTER }, carrier: 'a', ms: 2500, layers: ['line'], cam: 'wide', goalie: ['placement'], note: {
        en: 'Shooting line: from the ball to the middle of the goal. First, placement: stand on that line.',
        de: 'Schusslinie: vom Ball zur Tormitte. Erstens, Ausrichtung: auf dieser Linie stehen.' } },
      { players: { a: SHOOTER }, carrier: 'a', ms: 2500, layers: ['line'], cam: 'sideKnee', goalie: ['placement', 'depth'], note: {
        en: 'Second, depth: step forward along the line. The closer you stand to the ball, the smaller the goal looks to the shooter.',
        de: 'Zweitens, Tiefe: auf der Linie nach vorne. Je näher du am Ball stehst, desto kleiner wirkt das Tor für den Schützen.' } },
      { players: { a: SHOOTER }, carrier: 'a', ms: 2500, layers: ['line'], cam: 'shooterEyes', goalie: ['placement', 'depth', 'axis'], note: {
        en: 'Third, axis: knees and chest square to the ball, so the whole body is in the path of the shot.',
        de: 'Drittens, Achse: Knie und Brust frontal zum Ball, damit der ganze Körper im Weg des Schusses steht.' } },
      { players: { a: SHOOTER }, carrier: 'a', ms: 3000, layers: ['area'], cam: 'wide', note: {
        en: 'Shooting area: the triangle from the ball to both posts. On the line, forward and square, the body fills as much of it as it can.',
        de: 'Schussfläche: das Dreieck vom Ball zu beiden Pfosten. Auf der Linie, vorne und frontal, füllt der Körper so viel davon wie möglich.' } },
      { players: { a: SHOOTER }, carrier: 'a', ms: 3000, layers: ['line'], cam: 'followBall', note: {
        en: 'Now the same shot from the same spot.',
        de: 'Jetzt derselbe Schuss vom selben Punkt.' } },
      { players: { a: SHOOTER }, shot: { aimX: 0, ...SLOW_SHOT }, ms: 2500, layers: ['line'], cam: 'pushIn', note: {
        en: 'Saved. On the line, forward and square: the goalie is big and in the way.',
        de: 'Gehalten. Auf der Linie, vorne und frontal: der Goalie ist gross und im Weg.' } },
    ],
  },

  // 2. Through the zones, as a showcase: first the goalie stays centred and
  // deep whatever the ball does and the attacker walks in and scores ("what
  // went wrong?"), then the same walk with the goalie playing each zone.
  // The zones stay on screen, the shooting line only where the caption names it.
  zones: {
    n: 2,   // the lesson's number in the Library shelf (A-BACK-049)
    goal: 'A',
    title: { en: 'Through the zones', de: 'Durch die Zonen' },
    intro: {
      task: { en: 'Watch the goalie as the ball moves through the zones: what changes in each one?', de: 'Schau auf den Goalie, während der Ball durch die Zonen geht: was ändert sich in jeder Zone?' },
    },
    recap: {
      title: { en: 'What to take away', de: 'Das nimmst du mit' },
      bullets: [
        { en: 'Attention zone: centred, deep and patient.', de: 'Attention-Zone: mittig, tief und geduldig.' },
        { en: 'Danger zone: forward on the shooting line, square to the ball.', de: 'Danger-Zone: nach vorne auf die Schusslinie, frontal zum Ball.' },
        { en: 'Passing-first zone and behind the goal: on the line at the post, knees parallel, eyes on the slot.', de: 'Passing-First-Zone und hinter dem Tor: auf der Linie am Pfosten, Knie parallel, Blick zum Slot.' },
      ],
    },
    frames: [
      { players: { a: { x: 3000, z: 23750 } }, carrier: 'a', ms: 3000, layers: ['zones'], cam: 'wide', note: {
        en: 'First the goalie stays centred and deep, whatever the ball does. Attention zone: that is fine here.',
        de: 'Zuerst bleibt der Goalie mittig und tief, egal was der Ball macht. Attention-Zone: hier ist das richtig.' } },
      { players: { a: { x: 5000, z: 13750 } }, carrier: 'a', ms: 2500, layers: ['zones'], cam: 'wide', goalie: [], note: {
        en: 'Danger zone: the attacker comes closer, the goalie stays where he is.',
        de: 'Danger-Zone: der Angreifer kommt näher, der Goalie bleibt stehen.' } },
      { players: { a: ZONES_SHOOTER }, carrier: 'a', ms: 2000, layers: ['zones'], cam: 'wide', goalie: [], note: {
        en: 'Still deep and centred. The near post is open.',
        de: 'Immer noch tief und mittig. Der nahe Pfosten ist offen.' } },
      { players: { a: ZONES_SHOOTER }, shot: { aimX: 650, scored: true, ...SLOW_SHOT }, ms: 2500, layers: ['zones'], cam: 'wide', goalie: [], note: {
        en: 'Goal. What went wrong?',
        de: 'Tor. Was ist schiefgelaufen?' } },
      { players: { a: { x: 3000, z: 23750 } }, carrier: 'a', ms: 3000, layers: ['zones'], cam: 'wide', note: {
        en: 'Now again. Attention zone: stay patient, centred and deep, knees parallel to the goal line.',
        de: 'Jetzt nochmals. Attention-Zone: geduldig bleiben, mittig und tief, Knie parallel zur Torlinie.' } },
      { players: { a: { x: 5000, z: 13750 } }, carrier: 'a', ms: 2500, layers: ['zones', 'line'], cam: 'shooterEyes', note: {
        en: 'Danger zone: step forward onto the shooting line and square up to the ball.',
        de: 'Danger-Zone: nach vorne auf die Schusslinie und frontal zum Ball.' } },
      { players: { a: { x: 4500, z: 7750 } }, carrier: 'a', ms: 2000, layers: ['zones', 'line'], cam: 'shooterEyes', note: {
        en: 'The ball comes closer: move with it, stay on the shooting line and square.',
        de: 'Der Ball kommt näher: mitgehen, auf der Schusslinie und frontal bleiben.' } },
      { players: { a: { x: 4000, z: 2750 } }, carrier: 'a', ms: 2000, layers: ['zones'], cam: 'sideKnee', note: {
        en: 'Passing-First-Zone: back onto the line, at the ball-side post, knees parallel.',
        de: 'Passing-First-Zone: zurück auf die Linie, an den Pfosten auf der Ballseite, Knie parallel.' } },
      { players: { a: { x: 1500, z: 1450 } }, carrier: 'a', ms: 3000, layers: ['zones'], cam: 'wide', note: {
        en: 'Behind the goal: play the line, feet in the goal, eyes on the slot for the pass.',
        de: 'Hinter dem Tor: Linie spielen, Füsse im Tor, Blick zum Slot für den Pass.' } },
    ],
  },

  // 3. Pass or shot, as a showcase, three runs of the same 2-on-1. First a
  // goalie that reads the defender wrong: the defender takes the carrier, a
  // pass is coming, but the goalie steps out for the shot and the pass beats
  // it ("what went wrong?"). Then the pass read right and saved, then the
  // shot read right and saved. The pass lane shows while the read is pass,
  // the shooting line once it is shot. Shots are aimed at the middle of the
  // goal (the line the goalie stands on) in the right runs. The last caption
  // carries the old lesson 4's idea (most likely vs most dangerous).
  passOrShot: {
    n: 3,
    goal: 'A',
    title: { en: 'Pass or shot', de: 'Pass oder Schuss' },
    cast: { a: { team: 2, number: '9' }, b: { team: 2, number: '7' }, d: { team: 1, number: '4' } },
    intro: {
      task: { en: 'Watch the defender, then the goalie: how does the goalie know whether a pass or a shot is coming?', de: 'Schau auf den Verteidiger, dann auf den Goalie: woher weiss der Goalie, ob ein Pass oder ein Schuss kommt?' },
    },
    recap: {
      title: { en: 'What to take away', de: 'Das nimmst du mit' },
      bullets: [
        { en: 'Read the defender first.', de: 'Zuerst den Verteidiger lesen.' },
        { en: 'Defender on the carrier: a pass is coming. Stay back on the line, ready to push across.', de: 'Verteidiger beim Ballführer: ein Pass kommt. Hinten auf der Linie bleiben, bereit zum Verschieben.' },
        { en: 'Defender in the lane: a shot. Step forward and square up.', de: 'Verteidiger in der Passlinie: ein Schuss. Nach vorne und frontal stellen.' },
        { en: 'Most likely the shot, most dangerous the pass: while the pass is open, cover it.', de: 'Am wahrscheinlichsten der Schuss, am gefährlichsten der Pass: solange der Pass offen ist, ihn abdecken.' },
      ],
    },
    frames: [
      { players: PASS_START, carrier: 'a', ms: 2500, layers: [], cam: 'goalieEyes', note: {
        en: 'A 2-on-1 is coming. Watch the defender, then the goalie: does he read it?',
        de: 'Ein 2-gegen-1 kommt. Schau auf den Verteidiger, dann auf den Goalie: liest er es?' } },
      { players: PASS_READ, carrier: 'a', ms: 2500, layers: ['lane'], cam: 'sideKnee', goalie: ['placement', 'depth', 'axis'], goalieRead: 'shot', note: {
        en: 'The defender goes to the carrier: a pass is coming. But this goalie steps out for a shot.',
        de: 'Der Verteidiger geht zum Ballführer: ein Pass kommt. Aber dieser Goalie kommt für einen Schuss heraus.' } },
      { players: PASS_ACROSS, carrier: 'b', ms: 1800, layers: ['lane'], cam: 'followBall', goalie: ['placement', 'depth', 'axis'], goalieRead: 'shot', goalieDx: LATE_DX, note: {
        en: 'The pass goes across. The goalie is far out and too late.',
        de: 'Der Pass geht quer. Der Goalie steht weit vorne und ist zu spät.' } },
      { players: PASS_SHOT, shot: { aimX: -650, scored: true, ...SLOW_SHOT }, ms: 2500, layers: ['line'], cam: 'shooterEyes', goalie: ['placement', 'depth', 'axis'], goalieRead: 'shot', goalieDx: LATE_DX, note: {
        en: 'Goal. What went wrong?',
        de: 'Tor. Was ist schiefgelaufen?' } },
      { players: PASS_START, carrier: 'a', ms: 2500, layers: [], cam: 'goalieEyes', note: {
        en: 'Again. Attention zone: centred, deep, knees parallel. Watch the defender.',
        de: 'Nochmals. Attention-Zone: mittig, tief, Knie parallel. Auf den Verteidiger achten.' } },
      { players: PASS_READ, carrier: 'a', ms: 2500, layers: ['lane'], cam: 'sideKnee', note: {
        en: 'Defender on the carrier, second attacker free: a pass is coming. On the line but back, knees parallel, ready to push across.',
        de: 'Verteidiger beim Ballführer, zweiter Angreifer frei: ein Pass kommt. Auf der Linie, aber hinten, Knie parallel, bereit zum Verschieben.' } },
      { players: PASS_ACROSS, carrier: 'b', ms: 1800, layers: ['lane'], cam: 'followBall', note: {
        en: 'The pass is across: push over with it, then forward and square to the new shooter.',
        de: 'Der Pass ist drüben: mitschieben, dann nach vorne und frontal zum neuen Schützen.' } },
      { players: PASS_SHOT, shot: { aimX: 0, ...SLOW_SHOT }, ms: 3000, layers: ['line'], cam: 'pushIn', note: {
        en: 'Saved. The goalie went across with the pass and was square to the shot.',
        de: 'Gehalten. Der Goalie ist mit dem Pass mitgegangen und stand frontal zum Schuss.' } },
      { players: PASS_START, carrier: 'a', ms: 2500, layers: [], cam: 'goalieEyes', note: {
        en: 'The same start again, the same stance. Watch the defender once more.',
        de: 'Derselbe Start, dieselbe Haltung. Nochmals auf den Verteidiger achten.' } },
      { players: SHOT_READ, carrier: 'a', ms: 2500, layers: ['line'], cam: 'sideKnee', note: {
        en: 'This time the defender sits in the passing lane: the carrier will shoot. Forward on the shooting line, square to the ball.',
        de: 'Diesmal steht der Verteidiger in der Passlinie: der Ballführer schiesst. Nach vorne auf die Schusslinie, frontal zum Ball.' } },
      { players: SHOT_SHOT, shot: { aimX: 0, ...SLOW_SHOT }, ms: 3000, layers: ['line'], cam: 'pushIn', note: {
        en: 'Most likely: the shot. Most dangerous: the pass. Dangerous option open: stay back, ready to push across. Closed: play the shot.',
        de: 'Am wahrscheinlichsten: der Schuss. Am gefährlichsten: der Pass. Gefährliche Option offen: hinten bleiben, bereit zum Verschieben. Zu: den Schuss spielen.' } },
    ],
  },

  // 4. Behind the goal: the carrier goes round behind goal A from the right
  // to the left and comes out in front again on the left.
  behind: {
    n: 4,
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

// The pose with only the `applied` KATA dimensions right: the others stay at
// the default stance (deep, knees parallel to the goal line, centred). On
// the line means on it at the goalie's own depth.
function partialPose({ ball, goal, goalCenter, ideal, applied }) {
  const stance = { x: goalCenter.x, z: goalCenter.z + (goal === 'B' ? -250 : 250), yaw: goal === 'B' ? Math.PI : 0 };
  const z = applied.includes('depth') ? ideal.z : stance.z;
  const yaw = applied.includes('axis') ? ideal.yaw : stance.yaw;
  if (!applied.includes('placement')) return { x: stance.x, z, yaw };
  const onLine = idealGoaliePose({ ball, goal, goalCenter, goalie: { x: stance.x, z, yaw }, targets: { placement: { ref: 'line' }, depth: null, axis: null } });
  return { x: onLine.x, z, yaw };
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
      const s = makeShot(goal, { aimX: shot.aimX ?? 0 });   // in the net; a saved shot replaces it below
      ball = { x: s.rest.x, z: s.rest.z, shot: s.shot };
      const pass = {};
      if (shot.speedMps) pass.speedMps = shot.speedMps;
      if (shot.releaseT != null) pass.releaseT = shot.releaseT;
      if (Object.keys(pass).length) ball.pass = pass;
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
      ...(spec.layers ? { layers: [...spec.layers] } : {}),
      ...(spec.cam ? { cam: spec.cam } : {}),
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
  const rulePose = (ball, ms, read) => idealGoaliePose({
    ball, goal, goalCenter, goalie,
    targets: kataTargets(goalieZoneOf(ball, goal), read ?? expectedAction(doc.frames, ms), shotAngleDeg(ball, goal, goalCenter)),
  });
  for (const frame of doc.frames) {
    const idx = doc.frames.indexOf(frame);
    if (lesson.frames[idx].shot && !lesson.frames[idx].shot.scored) {
      // A lesson shot ends in a save: the ball stops just in front of the
      // goalie, on the shot path. The goalie stands on that line whatever
      // the exact release point, so one pass from the release point finds it.
      const prev = doc.frames[idx - 1];
      const { from } = passPlan(prev.scheme, frame.scheme, prev.duration);
      const s = savedShot(goal, { aimX: lesson.frames[idx].shot.aimX ?? 0 }, from, rulePose(from, startMs));
      frame.scheme.balls.main = { ...frame.scheme.balls.main, x: s.rest.x, z: s.rest.z, shot: s.shot };
    }
    const ball = frame.scheme.balls.main;
    // A goal: the goalie's pose is judged from the shot's release point, not from the ball in the net.
    let from = ball;
    if (lesson.frames[idx].shot?.scored) from = passPlan(doc.frames[idx - 1].scheme, frame.scheme, doc.frames[idx - 1].duration).from;
    const ideal = rulePose(from, startMs, lesson.frames[idx].goalieRead);
    const applied = lesson.frames[doc.frames.indexOf(frame)].goalie;
    if (applied) {
      goalie = partialPose({ ball: from, goal, goalCenter, ideal, applied });
      const dx = lesson.frames[idx].goalieDx;
      if (dx) goalie = { ...goalie, x: goalie.x + dx };
      frame.goalieFixed = true;
    } else goalie = ideal;
    frame.scheme.goalies[goal] = { x: goalie.x, z: goalie.z, angle: goalie.yaw };
    startMs += frame.duration;
  }
  if (lesson.intro || lesson.recap) doc.lesson = JSON.parse(JSON.stringify({ intro: lesson.intro, recap: lesson.recap }));   // title and recap card (lesson-cards.js)
  doc.currentFrame = 0;
  doc.autoGoalie = goal;   // playback moves this goalie by the rules between keyframes (goalie-track.js)
  return doc;
}
