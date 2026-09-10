// Semantic colour tokens - one source of truth for team + insight overlay
// colours, so Mode A (three.js scene) and Mode B (photo canvas 2D) render
// the same concepts identically. See docs/plan.md §3.3.
//
// Every token exposes both a numeric hex (for THREE.Color / material) and
// a CSS string (for canvas 2D / DOM). Kept in sync with web/src/tokens.css
// - if you change a value here, update the CSS mirror too.

function pair(hex) {
  return { hex, css: '#' + hex.toString(16).padStart(6, '0') };
}

// Team palette. Mode A: team 1 = home, team 2 = away. Mode B: home/away
// keys map straight through. Unifying these was the point of this module
// (Mode B previously used a different orange/blue pair).
export const TEAM_HOME = pair(0x2fbf4e);   // green
export const TEAM_AWAY = pair(0xd94b2f);   // red-orange

// Shot verdict palette (trajectory.js + photo-canvas.js shot lines).
// Interpretation is documented in trajectory.js: open = nothing in the way,
// blocked-off = goalie in the way but not squared up, blocked-centred =
// goalie squared up on the shot line.
export const VECTOR_SHOT_OPEN = pair(0xff3b30);
export const VECTOR_SHOT_BLOCKED_OFF = pair(0xffd21a);
export const VECTOR_SHOT_BLOCKED_CENTRED = pair(0x2ecc55);

// Pass corridor verdict (photo-canvas.js pass lines). Same colour language
// as shots by design: green = clear lane, red = defender in the corridor.
export const VECTOR_PASS_CLEAR = VECTOR_SHOT_BLOCKED_CENTRED;
export const VECTOR_PASS_BLOCKED = VECTOR_SHOT_OPEN;

// Coverage grid (coverage.js goal-mouth mesh, insights-overlay coverage tiles).
// Same "blocked = green, open = red" convention as shots/passes.
export const VECTOR_COVERAGE_BLOCKED = VECTOR_SHOT_BLOCKED_CENTRED;
export const VECTOR_COVERAGE_OPEN = VECTOR_SHOT_OPEN;

// Trajectory rays from ball to goal-mouth corners.
export const VECTOR_TRAJECTORY = pair(0xffe066);

// Semantic arrow roles for authoring in Mode A: pass / shot / run. Set via
// the Inspector 'Role' dropdown. Chosen to be recognisable at a glance and
// consistent with the shot/pass tokens above (green for pass = clear intent,
// red for shot = attack, yellow-amber for run = neutral movement).
export const VECTOR_ARROW_PASS = VECTOR_SHOT_BLOCKED_CENTRED;   // green
export const VECTOR_ARROW_SHOT = VECTOR_SHOT_OPEN;              // red
export const VECTOR_ARROW_RUN  = pair(0xffb347);                // amber

export const ARROW_ROLE_TOKENS = {
  pass: VECTOR_ARROW_PASS,
  shot: VECTOR_ARROW_SHOT,
  run:  VECTOR_ARROW_RUN,
};

export function arrowRoleColor(role) {
  return ARROW_ROLE_TOKENS[role]?.css ?? null;
}

// Look up a shot-verdict token by the key returned from insights.shotVerdict().
export const SHOT_LINE_TOKENS = {
  open: VECTOR_SHOT_OPEN,
  'blocked-off': VECTOR_SHOT_BLOCKED_OFF,
  'blocked-centred': VECTOR_SHOT_BLOCKED_CENTRED,
};

// Look up a team token by either scheme. Handles both Mode A integer keys
// (1/2) and Mode B string keys ('home'/'away').
export function teamToken(key) {
  if (key === 1 || key === 'home') return TEAM_HOME;
  if (key === 2 || key === 'away') return TEAM_AWAY;
  return null;
}
