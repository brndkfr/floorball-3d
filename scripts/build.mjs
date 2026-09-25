// Stages web/ into dist/ for deploy: minifies web/src/*.js per-file (no
// bundling - the app loads modules natively via index.html's import map,
// so bundling would break that architecture), swaps the dev-only
// Date.now() cache-bust for a stable one based on the commit SHA, and can
// drop directories nothing in index.html or web/src actually references
// (confirmed by grep before excluding - see docs/plan.md S-BACK-010).
//
// EXCLUDE_DIRS is currently empty: it used to carry lib/shoelace,
// lib/open-props, lib/radix-colors and design-sample, but those were
// deleted from the repo outright (not just excluded from dist/) after
// CodeQL flagged a bad HTML-comment regex inside vendored Shoelace - see
// docs/plan.md S-BACK-013. Re-vendor + re-add an entry here if that design
// stack (section 2 of plan.md) is picked back up.
//
// Local dev is untouched: `web/` itself is never modified, so the
// zero-build-step workflow in CLAUDE.md still works exactly as documented.

import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'web');
const OUT = join(ROOT, 'dist');

// Confirmed unreferenced by index.html/web/src (grep check before this was
// written) - see S-BACK-010 in docs/plan.md. Re-check with a fresh grep if
// this list is ever extended; don't exclude on a guess.
const EXCLUDE_DIRS = new Set([]);

function commitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim().slice(0, 12);
  } catch {
    return 'dev';
  }
}

function shouldExclude(relPath) {
  const posix = relPath.split('\\').join('/');
  for (const dir of EXCLUDE_DIRS) {
    if (posix === dir || posix.startsWith(dir + '/')) return true;
  }
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(SRC, full);
    if (shouldExclude(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const sha = commitSha();
  const files = walk(SRC);
  let jsCount = 0, otherCount = 0;

  for (const file of files) {
    const rel = relative(SRC, file).split('\\').join('/');
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });

    if (rel.startsWith('src/') && file.endsWith('.js')) {
      let code = readFileSync(file, 'utf8');
      // dev-only Date.now() cache-bust -> stable per-deploy value, source
      // file itself in web/ is never touched, only this staged copy
      code = code.replace('`?t=${Date.now()}`', JSON.stringify(`?v=${sha}`));
      const result = await esbuild.transform(code, {
        loader: 'js',
        format: 'esm',
        minify: true,
        target: 'es2022',
      });
      writeFileSync(dest, result.code);
      jsCount++;
    } else {
      copyFileSync(file, dest);
      otherCount++;
    }
  }

  console.log(`build: staged ${jsCount} minified .js + ${otherCount} other files into dist/ (commit ${sha})`);
}

main();
