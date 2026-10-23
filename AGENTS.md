# Working on Mr. Pending

Shared rules for every agent and reviewer in this repository. Claude Code builds, Codex reviews, GitHub Actions decides, the maintainer approves. The authoritative specifications are `docs/ARCHITECTURE.md`, `docs/MACHINE-RULES.md`, `docs/SECURITY-AND-FAILURE-CONTRACT.md` and `docs/MR-PENDING-CHARACTER-SHEET.md`; this file never repeats them.

## Scope

- Work happens one GitHub issue at a time, on a branch named `feat/<number>-<slug>` (or `fix/`), with `PENDING_ISSUE=<number>` set in the shell.
- An issue's **Allowed paths** are the only files that may change. The hook in `.claude/hooks/scope.mjs` blocks edits outside them and in protected paths; it is not a suggestion.
- Protected paths (manifests, `bun.lock`, `bunfig.toml`, CI, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `vite.config.ts`, `packages/contract/`, the four specifications, `LICENSE`) change only with the maintainer's approval, shown by the `protected-approved` label on the pull request, never to make a failing check pass. Graphify is a navigation aid; its installer never overwrites `.claude/` without that approval, and `graphify-out/` stays out of Git.
- A needed change outside the allowed paths is a reason to stop and ask, not to widen the work.
- `bun install` from the lockfile is routine. `bun add` only for a dependency the issue names, in a PR with the label (manifests and `bun.lock` are protected); no other dependency, no global tool, no installer. No runtime MCP servers, no agent tools: the model proposes blueprints, patches and memos, nothing else.

## Code

- Think before coding: restate the definition of done and the smallest complete change before the first edit; prefer the simplest solution that fully solves it; make surgical, issue-scoped changes; verify the outcome against the acceptance criteria, not against the intention.
- Strict TypeScript in every package (the options in ARCHITECTURE section 6); no `any`, `@ts-ignore`, `@ts-nocheck`, non-null or double assertions, rule-wide disables. A type error is fixed in the design, never silenced.
- `unknown` until a zod parse; types inferred from the one canonical schema, never duplicated as interfaces or DTOs; a JSON parse or an assertion is never a substitute for validation. Discriminated unions handled exhaustively, `assertNever`, named exports.
- Small cohesive modules with clear ownership; neither monoliths nor one-function files. An abstraction only when it improves cohesion, readability, testability or real reuse; no generic repositories, factories or managers, no catch-all utility files, no global state, no circular imports, no dead or commented-out code, no speculative infrastructure for a later issue.
- Comments are one line and explain why. Styling is CSS Modules (`*.module.css` beside the component) plus `tokens.css` and a minimal `global.css`; no Tailwind, Sass, CSS-in-JS, component framework or animation library.
- The simulator is the only source of facts. Narration never feeds a number into a report.
- Every string field bounded, every integer ranged, every external input parsed at the boundary.

## Tests and evidence

- Tests assert behaviour at boundaries: simulator, validation, repair, streaming, accessibility, security, end to end. No snapshots, no duplicated cases, no coverage target, no test added to inflate a count.
- A test or a gate is never weakened to turn CI green. Fixture `events.json` files are frozen; a rule change bumps `RULES_VERSION` in `docs/MACHINE-RULES.md` first.
- Only measured numbers from `eval/results/` appear anywhere. Nothing is described as working until its evidence exists.
- An issue is Done when its definition of done is met, its evidence is attached and CI is green on the merged PR, not when code has been written.

## Commits and pull requests

- Commit messages are plain ASCII: `feat(machine): implement deterministic event simulation (#6)`. One coherent change per behaviour; tests travel with the behaviour they protect. No empty commits, no fragmentation for the activity graph.
- The maintainer commits, pushes, merges, deploys, spends and applies `protected-approved` by hand. Agents prepare; they do not push, and they never set labels: an agent running under the maintainer's credentials could, which is why the label is a workflow control and the human approval in the PR is the real one.
- Every PR states Purpose, Changes, Verification (real output, never invented), Review (verdict, findings resolved, changed files within scope, and the commit SHA that was reviewed) and `Refs #<number>`, never `Closes`: the maintainer closes the issue after the evidence is attached, so a merge alone cannot mark unfinished work done. A push after the review invalidates it: the new head is reviewed again, and the maintainer merges only when the Review SHA equals the PR's head SHA.

## Code Review Rules

Codex reviews read-only: locally through its Claude Code plugin's script (`codex-companion.mjs review --wait --base origin/main`; the `/codex:review` command itself is user-only) at the boundaries marked `review: yes` in the issue, and on GitHub where automatic review is enabled. The native review answers `approve` or `needs-attention` with findings (severity, file, lines, recommendation): approve is PASS; needs-attention is CHANGES_REQUIRED, or BLOCKED when a finding concerns a protected path, the issue's scope, missing evidence or a milestone decision. The eight questions and the verdict line below bind Codex's GitHub review, which reads this section; whether the native local review applies them is checked by the planted defect in #3, and `adversarial-review` with this section as its focus text is the fallback. Answer eight questions with file and line references, concrete risks only, no speculative rewrites and no style preferences presented as defects:

1. Did the change touch anything outside the issue's allowed paths?
2. Does it satisfy the issue's definition of done?
3. Are there correctness, security or accessibility defects?
4. Are there unnecessary dependencies, abstractions or files?
5. Do the tests establish the claimed behaviour, or merely pass?
6. Is every external value validated before it becomes trusted domain data, with types inferred from the authoritative schema rather than duplicated?
7. Are assertions hiding invalid states, and does the type checker actually cover the changed files?
8. Could the behaviour be done more simply with code that already exists?

End with one verdict line, `PASS`, `CHANGES_REQUIRED` or `BLOCKED`, and numbered findings, each with location, severity and the required correction. Claude corrects `CHANGES_REQUIRED` findings inside the allowed paths and asks for another review, up to four rounds; after a fourth round without `PASS` it stops and hands the findings to the maintainer. Only a finding that needs a decision is escalated earlier: `BLOCKED` (a protected path, a scope conflict, missing evidence, a milestone decision) goes to the maintainer at once. A review that did not happen is not a `PASS`; a review never edits code (`@codex fix it` is not used). Review at feature boundaries (simulator rules, the Gemma spike gate, streaming and cancellation, security, voice, accessibility, the final integration), not after every save.
