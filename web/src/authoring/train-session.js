// Train mode's practice rink (A-BACK-054, A-Q-011). Pure and DOM-free so it
// is Node-testable; train-mode.js does the swapping on screen.
//
// Entering Train stashes the Plan doc as a JSON string, so nothing done in
// Train can reach it, and shows a practice doc instead; leaving restores the
// stash through acceptDoc() (which reinstalls the scheme accessor).

import { emptyDoc, acceptDoc } from './doc.js';
import { GOAL_LINE_FROM_BOARD } from '../constants.js';

// Default free situation: the ball 6 m in front of goal A, 1.5 m off centre,
// in the danger zone. An estimate picked to show a shot, not a sourced spot.
export const PRACTICE_BALL = Object.freeze({ x: 1500, z: GOAL_LINE_FROM_BOARD + 6000 });

export function practiceDoc() {
  const raw = JSON.parse(JSON.stringify(emptyDoc()));
  raw.meta.name = 'Goalie training';
  raw.frames[0].scheme.balls = { main: { x: PRACTICE_BALL.x, z: PRACTICE_BALL.z, carrier: null } };
  return acceptDoc(raw);
}

export const stashPlanDoc = (doc) => JSON.stringify(doc);

export function restorePlanDoc(stash) {
  if (!stash) return null;
  return acceptDoc(JSON.parse(stash));
}
