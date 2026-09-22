// Pure jersey-number assignment, extracted from chips.js's nextNumber so
// it's unit-testable without ensureDoc()/scene.js (S-BACK-009).

// The smallest positive integer 1..25 that isn't used by any player on the
// given team. Wraps to 1 after 25, so long sessions still yield a number.
export function nextAvailableNumber(players, team) {
  const used = new Set();
  for (const p of Object.values(players)) {
    if (p.team === team) used.add(Number(p.number));
  }
  for (let i = 1; i <= 25; i++) if (!used.has(i)) return i;
  return 1;
}
