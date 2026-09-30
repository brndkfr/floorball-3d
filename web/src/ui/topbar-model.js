// Pure helpers for the Broadcast top bar (web/src/ui/topbar.js).

// "frame 2 / 6" for the crumb next to the project name; '' without frames.
export function frameCrumb(doc) {
  const n = doc?.frames?.length ?? 0;
  if (!n) return '';
  const i = Math.min(Math.max(doc.currentFrame | 0, 0), n - 1);
  return `frame ${i + 1} / ${n}`;
}
