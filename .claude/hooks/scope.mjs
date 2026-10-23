// Scope gate. One rule set, two modes.
//   PreToolUse hook (no args): reads the Edit/Write tool input from stdin and exits 2 to block an edit outside the
//     active issue's "Allowed paths" or in a protected path. Convenience for the editing session; it cannot see
//     shell edits, so it is not the enforcement boundary.
//   CI / pre-PR (--diff <base>): the enforcement boundary. Checks every file changed since <base> against the
//     issue named in the branch, reading the issue fresh from GitHub (no cache, no env flags). Protected paths
//     pass only when the pull request carries the label "protected-approved", which only a collaborator can set;
//     CI passes the PR's labels in PR_LABELS.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const protectedPaths = ['package.json', '**/package.json', 'bun.lock', 'bunfig.toml', '.github/**', '.claude/**', 'AGENTS.md', 'CLAUDE.md', 'vite.config.ts', 'packages/contract/**',
  'docs/ARCHITECTURE.md', 'docs/MACHINE-RULES.md', 'docs/SECURITY-AND-FAILURE-CONTRACT.md', 'docs/MR-PENDING-CHARACTER-SHEET.md', 'LICENSE'];
const CACHE_TTL_MS = 10 * 60 * 1000;

const toRegex = (glob) => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*')   // placeholders keep the single-star pass off the double-star output
  .replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');
const matches = (file, globs) => globs.some((g) => toRegex(g).test(file));

function fetchAllowedPaths(issue) {
  const body = JSON.parse(execFileSync('gh', ['issue', 'view', String(issue), '--json', 'body'], { encoding: 'utf8' })).body ?? '';
  const line = body.split('\n').find((l) => l.startsWith('**Allowed paths:**')) ?? '';
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function cachedAllowedPaths(issue) {
  const cache = resolve(root, '.claude', '.scope-cache.json');
  const cached = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : {};
  const hit = cached[issue];
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.globs;
  const globs = fetchAllowedPaths(issue);
  mkdirSync(resolve(root, '.claude'), { recursive: true });
  writeFileSync(cache, JSON.stringify({ ...cached, [issue]: { globs, fetchedAt: Date.now() } }, null, 2));
  return globs;
}

function verdict(file, issue, allowed, protectedOk) {
  if (matches(file, protectedPaths) && !protectedOk) return `${file} is a protected path; it changes only with the maintainer's approval (label protected-approved on the PR)`;
  if (!matches(file, allowed)) return `${file} is outside the allowed paths of issue #${issue}: ${allowed.join(', ') || 'none'}`;
  return null;
}

if (process.argv[2] === '--diff') {
  const base = process.argv[3] ?? 'origin/main';
  const branch = process.env.GITHUB_HEAD_REF || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  const issue = branch.match(/^(?:feat|fix)\/(\d+)-/)?.[1];
  if (!issue) { console.error(`no issue number in branch name ${branch}; use feat/<number>-<slug>`); process.exit(2); }
  const allowed = fetchAllowedPaths(issue);
  const protectedOk = (process.env.PR_LABELS ?? '').split(',').map((s) => s.trim()).includes('protected-approved');
  // --no-renames: a rename is a deletion plus an addition, so both paths are judged (a renamed CI file is still a CI change)
  const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const problems = changed.map((f) => verdict(f, issue, allowed, protectedOk)).filter(Boolean);
  if (problems.length) { console.error(problems.join('\n')); process.exit(2); }
  console.log(`${changed.length} changed files within the scope of issue #${issue}${protectedOk ? ' (protected changes approved by label)' : ''}`);
} else {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const path = input.tool_input?.file_path;
  if (!path) process.exit(0);
  const issue = process.env.PENDING_ISSUE;
  if (!issue) { console.error('PENDING_ISSUE is not set; no edits without an active issue'); process.exit(2); }
  const file = relative(root, resolve(path)).replaceAll('\\', '/');
  const problem = verdict(file, issue, cachedAllowedPaths(issue), process.env.PENDING_ALLOW_PROTECTED === '1');
  if (problem) { console.error(problem); process.exit(2); }
}
