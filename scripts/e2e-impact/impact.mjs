// Coverage-based e2e test selection (S-BACK-018). Pure logic, node-tested in
// test/e2e-impact.test.js; record.mjs / select.mjs do the git + Playwright I/O.
//
// The impact map (test-e2e/.impact-map.json) says, per web/src file, which
// functions exist (1-based line spans) and which tests executed each one:
//   { version, sha, tests: [{ file, line, title, covered }],
//     files: { 'web/src/x.js': { fns: [[s, e, top]], hits: [[testIdx...]] } } }
// A diff against `sha` then maps each changed line to its innermost function.

import path from 'node:path';

export const BOOTSTRAP_SPEC = 'test-e2e/bootstrap.spec.js';

// 'src' = selected by coverage, 'spec' = run that spec, 'full' = run everything,
// 'ignore' = cannot change e2e behaviour.
export function classifyPath(p) {
  if (/^web\/src\/.*\.js$/.test(p)) return 'src';
  if (/^test-e2e\/.*\.spec\.js$/.test(p)) return 'spec';
  if (/^(docs|test|generators|\.github|\.claude)\//.test(p)) return 'ignore';
  if (/^scripts\//.test(p) && p !== 'scripts/serve-static.mjs') return 'ignore';
  if (/\.md$/.test(p) || p === '.gitignore') return 'ignore';
  return 'full';
}

// `git diff --unified=0 --no-renames` output -> [{ path, status, hunks }].
// Hunk positions are old-side (the recorded commit's lines).
export function parseDiff(text) {
  const files = [];
  let cur = null;
  let h = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (head) {
      cur = { path: head[2], status: 'modified', hunks: [] };
      files.push(cur);
      h = null;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file mode')) { cur.status = 'added'; continue; }
    if (line.startsWith('deleted file mode')) { cur.status = 'deleted'; continue; }
    const hh = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (hh) {
      h = { oldStart: Number(hh[1]), oldCount: hh[2] === undefined ? 1 : Number(hh[2]), removed: [], added: [] };
      cur.hunks.push(h);
      continue;
    }
    if (!h) continue;
    if (line.startsWith('-')) h.removed.push(line.slice(1));
    else if (line.startsWith('+')) h.added.push(line.slice(1));
  }
  return files;
}

const IMPORT_RE = /^import\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const FN_START_RE = /^(export\s+)?(async\s+)?function\*?\s*[\w$]*\s*\(/;
const COMMENT_RE = /^\s*(\/\/|\/\*|\*)/;

function count(s, ch) { return s.split(ch).length - 1; }

// One side of a hunk is inert when, minus imports of already-loaded modules
// (or packages), it is only comments / blank lines / complete function declarations.
function sideIsInert(lines, { path: file, known }) {
  let text = lines.join('\n');
  let ok = true;
  text = text.replace(IMPORT_RE, (_, spec) => {
    // A relative module no test ever loaded brings new module-init code with it.
    if (spec.startsWith('.') && !known.has(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)))) ok = false;
    return '';
  });
  if (!ok) return false;
  let inside = false;
  for (const line of text.split('\n')) {
    if (inside) {
      if (/^\}/.test(line)) inside = false;
      continue;
    }
    if (!line.trim() || COMMENT_RE.test(line)) continue;
    if (!FN_START_RE.test(line)) return false;
    // Single-line declaration: `function f() { return 1; }`.
    if (!(count(line, '{') > 0 && count(line, '{') === count(line, '}'))) inside = true;
  }
  return !inside;
}

export function isInertTopLevelHunk(hunk, ctx) {
  return sideIsInert(hunk.removed, ctx) && sideIsInert(hunk.added, ctx);
}

// V8 function coverage for one script -> [{ s, e, top, hit }] (1-based, inclusive lines).
export function coverageToLines(source, functions) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const out = [];
  const seen = new Set();
  for (const fn of functions) {
    const r = fn.ranges?.[0];
    if (!r) continue;
    const top = r.startOffset === 0 && r.endOffset >= source.length;
    const s = lineOf(r.startOffset);
    const e = lineOf(Math.max(r.startOffset, r.endOffset - 1));
    const key = `${s}:${e}:${top}`;
    if (seen.has(key)) {
      if (r.count > 0) out.find((o) => `${o.s}:${o.e}:${o.top}` === key).hit = true;
      continue;
    }
    seen.add(key);
    out.push({ s, e, top, hit: r.count > 0 });
  }
  return out;
}

// parts: [{ test: { file, line, title }, files: { path: [{ s, e, top, hit }] } }]
export function buildMap(sha, parts) {
  const map = { version: 1, sha, tests: [], files: {} };
  parts.forEach((part, idx) => {
    const files = part.files || {};
    map.tests.push({ ...part.test, covered: Object.keys(files).length > 0 });
    for (const [file, fns] of Object.entries(files)) {
      const entry = map.files[file] ??= { fns: [], hits: [], index: new Map() };
      for (const f of fns) {
        const key = `${f.s}:${f.e}:${f.top ? 1 : 0}`;
        let i = entry.index.get(key);
        if (i === undefined) {
          i = entry.fns.length;
          entry.index.set(key, i);
          entry.fns.push([f.s, f.e, f.top ? 1 : 0]);
          entry.hits.push([]);
        }
        if (f.hit && !entry.hits[i].includes(idx)) entry.hits[i].push(idx);
      }
    }
  });
  for (const entry of Object.values(map.files)) delete entry.index;
  return map;
}

const testTarget = (t) => `${t.file}:${t.line}`;

// changes: parseDiff() output. Returns { full: reason | null, targets, uncovered, notes }.
export function selectTests(map, changes) {
  const specs = new Set([BOOTSTRAP_SPEC]);
  const picked = new Set();
  const uncovered = [];
  const notes = [];
  const known = new Set(Object.keys(map.files));
  const full = (reason) => ({ full: reason, targets: [], uncovered, notes });

  map.tests.forEach((t, i) => { if (!t.covered) picked.add(i); });

  for (const change of changes) {
    const kind = classifyPath(change.path);
    if (kind === 'ignore') continue;
    if (kind === 'full') return full(`${change.path} changed`);
    if (kind === 'spec') {
      if (change.status !== 'deleted') specs.add(change.path);
      continue;
    }
    if (change.status === 'deleted') return full(`${change.path} deleted`);
    if (change.status === 'added') {
      notes.push(`${change.path} is new: runs through the changed code that imports it`);
      continue;
    }
    const fileMap = map.files[change.path];
    if (!fileMap) {
      uncovered.push(`${change.path} (no test loads it)`);
      continue;
    }
    for (const hunk of change.hunks) {
      const points = hunk.oldCount > 0
        ? Array.from({ length: hunk.oldCount }, (_, k) => hunk.oldStart + k)
        : [Math.max(hunk.oldStart, 1)];
      // A pure insertion goes *after* old line `line`: it is inside a function only
      // if that function continues past it (not after its closing line).
      const insertion = hunk.oldCount === 0;
      for (const line of points) {
        const around = fileMap.fns
          .map((fn, i) => ({ s: fn[0], e: fn[1], top: fn[2] === 1, hits: fileMap.hits[i] }))
          .filter((fn) => fn.s <= line && (insertion ? line < fn.e : line <= fn.e))
          .sort((a, b) => (a.e - a.s) - (b.e - b.s));
        if (!around.length || around[0].top) {
          if (isInertTopLevelHunk(hunk, { path: change.path, known })) continue;
          return full(`${change.path}:${line} is module-init code`);
        }
        const owner = around.find((fn) => !fn.top && fn.hits.length);
        if (!owner) {
          uncovered.push(`${change.path}:${line}`);
          continue;
        }
        for (const i of owner.hits) picked.add(i);
      }
    }
  }

  const targets = new Set(specs);
  for (const i of picked) {
    const t = map.tests[i];
    if (!specs.has(t.file)) targets.add(testTarget(t));
  }
  return { full: null, targets: [...targets].sort(), uncovered: [...new Set(uncovered)], notes };
}
