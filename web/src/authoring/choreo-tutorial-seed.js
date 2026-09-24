// Starting doc for the guided Choreo tutorial (A-BACK-019): #7 has the ball, #9 is open
// further up the rink (+z), and one defender stands between them.

import { emptyDoc, emptyMeta, newId } from './doc.js';
import { BALL_CARRY_OFFSET } from './ball-pose.js';

export const TUTORIAL_NAME = 'Tutorial: first choreo';

export function buildTutorialDoc() {
  const doc = emptyDoc();
  doc.meta = emptyMeta(TUTORIAL_NAME);
  const scheme = doc.frames[0].scheme;
  const add = (team, number, x, z) => {
    const id = newId('p');
    scheme.players[id] = { id, team, number: String(number), x, z, angle: 0 };
    return scheme.players[id];
  };
  // Just above and right of centre in top-down (+x up, +z right): clear of the card and side panels.
  const seven = add(1, 7, 1000, 21000);
  add(1, 9, 4000, 27000);
  add(2, 4, 2500, 24000);
  scheme.balls.main = { x: seven.x + BALL_CARRY_OFFSET.x, z: seven.z + BALL_CARRY_OFFSET.z, carrier: seven.id };
  return doc;
}
