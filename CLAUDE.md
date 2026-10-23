# Claude Code in this repository

Read `AGENTS.md` first; it holds the shared rules. The specifications are the four `*.md` files in `docs/`.

Procedure for one issue:

1. `PENDING_ISSUE` is set and the branch is `feat/<number>-<slug>`. Read the issue: definition of done, allowed paths, tests, stop condition, evidence.
2. Read only the specification sections the issue names and the files in its allowed paths. Do not explore the whole repository; ask Graphify only an architecture or dependency question, when one arises.
3. Before the first edit, write down the smallest complete change that meets the definition of done; then implement exactly that, reusing existing domain types and functions, with targeted behavioural tests, inside the allowed paths. The scope hook blocks anything else; if it blocks a change the issue needs, stop and report instead of working around it.
4. Run `vp check` and the focused tests for the touched package (`vp test <path>`), then the fixture replay if `packages/machine` changed. Dependencies are installed with `bun install`; never with pnpm or npm.
5. Remove temporary, debug and dead code; read the diff once for unnecessary files, abstractions and dependencies.
6. If the issue says `Review: yes`: the plugin's `/codex:review` command is user-only, so run its script yourself, read-only: locate it with `find ~/.claude/plugins -name codex-companion.mjs`, then `node <that path> review --wait --base origin/main`. The output ends in `Verdict: approve` (PASS) or `needs-attention` with findings (CHANGES_REQUIRED, or BLOCKED when a finding concerns a protected path, this issue's scope, missing evidence or a milestone decision). Correct findings inside the allowed paths and run it again, up to four rounds; escalate to the maintainer only a finding that needs a decision (BLOCKED, at once), and hand the findings over if the fourth round does not pass. Record the verdict with the commit it reviewed (`git rev-parse HEAD`); any later change means another review. A review that did not run is not a pass.
7. Report: what changed, the real command output, the review verdict and its SHA, what is not done, and the evidence the issue asks for. Propose the commit message; do not commit, push, merge or deploy. `bun install` from the lockfile is routine; `bun add` only for a dependency the issue names; no global tools, no installers.
8. Stop at the definition of done. The next issue starts when the maintainer says so.

Never: widen scope, add a dependency, edit a protected path, weaken a test or a gate, invent a number, claim a check ran that did not.
