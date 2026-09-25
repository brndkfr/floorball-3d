// Version stamped into `?v=<sha>` by scripts/build.mjs. BUILD_SHA first: the
// Pages workflow builds branch previews inside a run whose GITHUB_SHA is
// main's and GITHUB_* can't be overridden, so it passes the branch's own
// commit here. Then GITHUB_SHA (CI), then git, then 'dev'.
export function commitSha(env = process.env, gitHead) {
  const sha = env.BUILD_SHA || env.GITHUB_SHA;
  if (sha) return sha.slice(0, 12);
  try {
    return gitHead().trim().slice(0, 12);
  } catch {
    return 'dev';
  }
}
