// Choreograph pass-arrow geometry (A-BACK-018), three-free so it is Node-testable.
// Carrier ends are pulled back by `trim` so the arrow meets the chip edge, not its centre.

const finite = (p) => p != null && Number.isFinite(p.x) && Number.isFinite(p.z);

export function passPreview({ startCarrier = null, carrier = null, from, to, trim = 0, minLen = 300 }) {
  if ((startCarrier ?? null) === (carrier ?? null)) return null;
  if (!finite(from) || !finite(to)) return null;
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const trimStart = startCarrier != null ? trim : 0;
  const trimEnd = carrier != null ? trim : 0;
  if (len - trimStart - trimEnd < minLen) return null;
  const ux = dx / len, uz = dz / len;
  return {
    from: { x: from.x + ux * trimStart, z: from.z + uz * trimStart },
    to: { x: to.x - ux * trimEnd, z: to.z - uz * trimEnd },
  };
}

// Inspector "Pass to" buttons: carrier's teammates, or every player when the ball is loose.
export function passTargets(players, carrierId) {
  const carrier = players.find((p) => p.id === carrierId);
  const pool = carrier ? players.filter((p) => p.team === carrier.team && p.id !== carrier.id) : players;
  return [...pool]
    .sort((a, b) => (a.team - b.team) || (Number(a.number) - Number(b.number)))
    .map((p) => ({ id: p.id, text: `#${p.number}` + (p.label ? ` ${p.label}` : '') }));
}
