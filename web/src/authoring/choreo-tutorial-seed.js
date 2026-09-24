// Starting doc for the guided Choreo tutorial (A-BACK-019): #7 has the ball, #9 is open
// further up the rink (+z), and one defender stands between them.

import { emptyDoc, emptyMeta, newId } from './doc.js';

export const TUTORIAL_NAME = 'Tutorial: first choreo';

const BALL_CARRY_DZ = 250;   // matches BALL_CARRY_OFFSET in actors.js

export function buildTutorialDoc() {
  const doc = emptyDoc();
  doc.meta = emptyMeta(TUTORIAL_NAME);
  const scheme = doc.frames[0].scheme;
  const add = (team, number, x, z) => {
    const id = newId('p');
    scheme.players[id] = { id, team, number: String(number), x, z, angle: 0 };
    return scheme.players[id];
  };
  const seven = add(1, 7, 7000, 22000);
  add(1, 9, 13000, 29000);
  add(2, 4, 10000, 25500);
  scheme.balls.main = { x: seven.x, z: seven.z + BALL_CARRY_DZ, carrier: seven.id };
  return doc;
}
