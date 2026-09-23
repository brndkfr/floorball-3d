// Pure goal-corner fitting from near-vertical line segments (the two posts),
// used by detect.js inside a user ROI. The red-mask blob alone is unreliable
// there: a goalie hides part of the frame and the crossbar washes out over
// white ad boards, so minAreaRect of whatever blob survives lands on the
// wrong corners. The posts are the most robust red feature in any view.

const MAX_TILT = Math.tan(20 * Math.PI / 180);

// segments: [[x1, y1, x2, y2], ...] in any consistent px space.
// Returns [TL, TR, BR, BL] or null if two distinct posts can't be found.
export function cornersFromPosts(segments, {
  minPostFrac = 0.25,   // second post must span >= this fraction of the longest
  minSepFrac = 0.3,     // posts must be >= this fraction of the longest post apart
  fullFrac = 0.85,      // a post shorter than this fraction of the other is treated as occluded
} = {}) {
  const verts = [];
  for (const [x1, y1, x2, y2] of segments || []) {
    const dy = Math.abs(y2 - y1);
    if (dy === 0 || Math.abs(x2 - x1) > dy * MAX_TILT) continue;
    const top = y1 <= y2 ? [x1, y1] : [x2, y2];
    const bottom = y1 <= y2 ? [x2, y2] : [x1, y1];
    verts.push({ top, bottom, midX: (x1 + x2) / 2 });
  }
  if (verts.length < 2) return null;

  const maxLen = Math.max(...verts.map((v) => v.bottom[1] - v.top[1]));
  const gap = Math.max(4, maxLen * 0.1);
  verts.sort((a, b) => a.midX - b.midX);
  const clusters = [];
  for (const v of verts) {
    const last = clusters[clusters.length - 1];
    if (last && v.midX - last.maxX <= gap) {
      if (v.top[1] < last.top[1]) last.top = v.top;
      if (v.bottom[1] > last.bottom[1]) last.bottom = v.bottom;
      last.maxX = v.midX;
      last.sumX += v.midX; last.n++;
    } else {
      clusters.push({ top: v.top, bottom: v.bottom, maxX: v.midX, sumX: v.midX, n: 1 });
    }
  }
  for (const c of clusters) { c.x = c.sumX / c.n; c.len = c.bottom[1] - c.top[1]; }

  const anchor = clusters.reduce((a, b) => (b.len > a.len ? b : a));
  let other = null;
  for (const c of clusters) {
    if (c === anchor || c.len < anchor.len * minPostFrac) continue;
    if (!other || Math.abs(c.x - anchor.x) > Math.abs(other.x - anchor.x)) other = c;
  }
  if (!other || Math.abs(other.x - anchor.x) < anchor.len * minSepFrac) return null;

  let { top, bottom } = other;
  if (other.len < anchor.len * fullFrac) {
    // a short visible stub's own tilt is noise - posts are near-parallel in the image
    const dirX = (anchor.bottom[0] - anchor.top[0]) / Math.max(1, anchor.len);
    const topTrusted = Math.abs(top[1] - anchor.top[1]) <= Math.abs(bottom[1] - anchor.bottom[1]);
    if (topTrusted) bottom = [top[0] + dirX * anchor.len, top[1] + anchor.len];
    else top = [bottom[0] - dirX * anchor.len, bottom[1] - anchor.len];
  }
  const a = { top: anchor.top, bottom: anchor.bottom, x: anchor.x };
  const o = { top, bottom, x: other.x };
  const [left, right] = a.x < o.x ? [a, o] : [o, a];
  return [left.top, right.top, right.bottom, left.bottom];
}
