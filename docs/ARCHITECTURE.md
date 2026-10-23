# Mr. Pending: Architecture

Mr. Pending is a web app in which a very slow snail, Chief Engineer of the Department of Unnecessary Engineering, is given one job: press one blue button. An open-weight model (Gemma 4) drafts an absurd machine for it, a deterministic simulator runs the machine and reports exactly where it stopped, the model repairs it, and Mr. Pending narrates the affair. He then issues an Engineering Report, whether or not the button was pressed.

Read with `MACHINE-RULES.md` (board, parts, simulator), `SECURITY-AND-FAILURE-CONTRACT.md` (errors, limits, streaming, secrets, tests) and `MR-PENDING-CHARACTER-SHEET.md` (character, copy, look, motion). Where the contract is stricter, it wins.

Four principles:

- **The model designs; the simulator judges.** Gemma writes blueprints, patches and one memo per attempt, nothing else. The simulator is deterministic, replays byte for byte and is the only source of facts: attempts, parts, cells, whether the button was pressed. No narration ever feeds a number into a report.
- **Local first.** The product is an open-weight model on the user's own machine. The public site is static and only replays machines recorded from local inference; live generation exists in the local installation, never on the public site. A hosted model is a labelled configuration for comparison, never a silent switch.
- **Mr. Pending can be slow. The software cannot.** The first screen works before the model, the voice service or any recording has loaded. Every wait is animated; every fallback looks deliberate.
- **Fewest abstractions that fully solve the problem.** One page, one reducer per screen, plain fetch, plain components, pure functions for the machine.

## 1. Layout

```
pending/
├─ apps/web/            React 19 + TS single-page app (Vite+): form, board, Mr. Pending, report, gallery
├─ apps/agent/          Mastra server (Node LTS): build loop, model calls, TTS proxy, limits
├─ packages/contract/   zod schemas shared by everything: Form, Blueprint, Patch, SimEvent, Attempt, Build, API
├─ packages/machine/    pure TS, no I/O: catalogue, validate, simulate, applyPatch, report, fixtures
├─ eval/                scenarios, runner, results
└─ .github/workflows/ci.yml
```

Dependency direction, lint-enforced: `web → machine → contract ← agent`, `agent → machine`, `eval → agent + machine`. The apps never import each other; `machine` depends on `contract` only.

## 2. Contract (`packages/contract`)

The model answers in exactly this shape. The server validates it; the web app parses it again at the boundary. Types are only `z.infer`'d, never retyped. The source is authoritative: [`packages/contract/src/blueprint.ts`](../packages/contract/src/blueprint.ts) (cells, parts, blueprint, patch, form, replies, partial), [`events.ts`](../packages/contract/src/events.ts) (`SimEvent`), [`build.ts`](../packages/contract/src/build.ts) (`Beat`, `Line`, `Attempt`, `Report`, `Model`, `BuildHeader`, `Build`) and [`api.ts`](../packages/contract/src/api.ts) (stream events, `ApiError`, `Config`). This section is the field list.

- **`Cell`**: `A1` to `L7`, 12 × 7; A1 is the hopper, L7 the button. **`PartKind`**: `ramp`, `dominoes`, `seesaw`, `catapult`, `conveyor`, `fan`. **`PartId`**: `p` and one or two digits, shared by `Part`, `Patch` and `SimEvent`.
- **`Part`**, discriminated on `kind`: `id`, `cell`, `dir` (`east` | `west`) and exactly its own parameter (MACHINE-RULES section 2): conveyor `length` 2–6, ramp `length` 2–4, dominoes `length` 2–5, seesaw none, catapult `power` 2–5, fan `power` 1–4. A generic optional field let the model omit lengths (measured 21 Oct).
- **`Blueprint`**: `title` ≤ 40 chars (first, so it streams first), `parts` ≤ 14.
- **`Patch`**: 1–4 ops: `add { part }` (the id must be new to the whole build, so diffs stay unambiguous), `move { id, cell }`, `remove { id }`.
- **`Form`** (Form 27B/6; the user's text is data, never instructions): `nature` ≤ 180 chars, `minParts` 2–8, `maxParts` 4–14, optional `required` and `forbidden` kinds; `minParts ≤ maxParts`, and no kind is both required and forbidden.
- **`DesignReply`**: `blueprint`, `memo` ≤ 160. **`RepairReply`**: `patch`, `memo` ≤ 160.
- **`BlueprintPartial`**: optional `title` ≤ 40, optional `parts` ≤ 14, each with optional `kind` and `cell`. Explicit, not deepPartial: a half-streamed part must still parse so the board can draw it. Bounded like the final blueprint and stripped of unknown keys; the server forwards a partial only after it passes, and drops the rest.
- **`Line`**: `id`, `beat` (`Beat`), `mood` (`slow` | `excited` | `deadpan`), `text` ≤ 160, `source` (`table` | `model`), `at { attempt 1–6, step 0–200 }`. A model memo is a `Line` with source `model`: shown under a memo label, spoken like any line.
- **`Attempt`**: `n` 1–6, `blueprint`, `violations` (≤ 8, each ≤ 120), `events` (≤ 400 `SimEvent`), `outcome` (`pressed` | `lost` | `stalled` | `invalid`), optional `failedAt`, optional `patch`: the patch that produced this blueprint from the previous attempt's, absent on attempt 1.
- **`Report`**: `attempts` 1–6 (= `attempts.length`), `parts` 0–14 (the last attempt's part count, never a sum over repairs), `pressed` (= the last outcome), optional `failedAt`, `verdict` ≤ 120.
- **`BuildHeader`**: `id` (bounded ASCII), `contractVersion`, `rulesVersion`, `promptVersion` (bounded ASCII versions), `form`, `model { mode (local | hosted), id, host (ollama | openrouter), optional digest, optional runtime }`, `title` ≤ 40, `report`, `createdAt` (ISO datetime with millisecond precision).
- **`Build`**: `BuildHeader` plus `attempts` (1–6) and `lines` (≤ 60; six attempts with asides reach 51, 40 was already at the edge).

Every string has a `.max()`, every integer a range; nothing in a record is unbounded. The JSON Schema the model is constrained with is derived from these zod schemas with `z.toJSONSchema()` (`designReplyJsonSchema`, `repairReplyJsonSchema`) and tested against the fixtures; there is no hand-maintained second copy of the catalogue. Invariant, checked on replay: `applyPatch(attempts[k-1].blueprint, attempts[k].patch)` deep-equals `attempts[k].blueprint`, and the repair diff screen for attempt *k* is drawn from exactly that patch over the previous board.

`SimEvent` and `Beat` are described in `MACHINE-RULES.md` and the character sheet and defined in `events.ts` and `build.ts`. `api.ts` defines the stream events (`partial | line | attempt | patch | done | error | ping`, each with `requestId`), `ApiError` and `Config`.

**Build is the unit of record.** It is what the gallery stores, what "My department" keeps in the browser, what the eval writes and what a gallery link opens. `Report` is computed by `machine/report.ts` from `attempts` alone; `Line.text` is never an input to it. Replay rule: `simulate(attempt.blueprint)` must equal `attempt.events` byte for byte; CI checks every gallery record. One rules version at a time: a record whose `rulesVersion` is not the current `RULES_VERSION` is refused with a plain message, there is no versioned simulator, and the gallery is regenerated whenever the rules change. `model.digest` and `model.runtime` (the Ollama model digest and version) document provenance; they do not prove it, so the README also states the procedure that produced the gallery.

**Streaming rule.** A `partial` may drive only reversible UI: parts appearing on the board as Mr. Pending draws. Simulation, narration and the report wait for validated objects. `done` carries the `BuildHeader` only; the client assembles the `Build` from the `attempt` and `line` events it already holds and recomputes `report` from the attempts, so no single event ever needs to carry the whole record.

## 3. Web app (`apps/web`)

One page, no router, no query library, no global store; the path is read once on mount to open a gallery record (`/r/<slug>`). Two build-time site modes (`VITE_SITE_MODE`): **`static`** is the public site, gallery and player over recorded builds with browser voices and captions, and its bundle contains no API call at all (the form, the build client, `/api/config` and TTS code are excluded; a test asserts no `/api` string in the static bundle); **`local`** is the installation with the agent beside it, where the form is primary. The front door in `static` mode opens on the gallery: "Watch Mr. Pending at work" is the primary action, "Run it on your machine" the secondary. Six feature slices (`build`, `board`, `engineer`, `voice`, `report`, `gallery`), each owning its components, hooks, pure model and client, exposing only `index.ts`. Import rule, lint-enforced: `app` imports feature `index.ts` files, `shared`, `machine` and `contract`; a feature imports its own files, other features' `index.ts`, `shared`, `machine` and `contract`; `shared` imports nothing from features and nothing from the packages.

**State** is one reducer, no boolean soup:

```ts
type Session =
  | { status: 'idle'; form?: Form }
  | { status: 'designing'; requestId: string; form: Form; startedAt: number; partial: BlueprintPartial; lines: Line[] }
  | { status: 'running';   requestId: string; form: Form; attempts: Attempt[]; lines: Line[]; step: number; speed: 0.5 | 1 | 3; paused: boolean; final?: BuildHeader }
  | { status: 'repairing'; requestId: string; form: Form; attempts: Attempt[]; lines: Line[]; speed: 0.5 | 1 | 3 }
  | { status: 'pressed' | 'exhausted'; requestId: string; build: Build }
  | { status: 'error';     requestId: string; form: Form; attempts: Attempt[]; error: AppError };
```

Events: `FILE | PARTIAL | LINE | ATTEMPT | PATCH | DONE | FAIL | CANCEL | RESET | TICK | SPEED | PAUSE | REPLAY`, each carrying `requestId`. Three approved deviations from the first sketch (#12): `designing` holds the lines said before the first attempt; `repairing` keeps the chosen speed, so the next attempt plays at it; and the visitor controls playback: `running` can be paused (`PAUSE`), and `REPLAY` plays the held attempts again from the first, during playback or after it. Impossible transitions and stale `requestId`s leave the state unchanged. `CANCEL` returns to `idle` with the form kept; it is not an error. The client queues server events and plays them at animation pace: attempt *n* animates while the server is already repairing, so model latency hides behind the animation. Server completion and playback completion are different things: `DONE` only stores `final`; the state becomes `pressed` or `exhausted` on the `TICK` that reaches the last event of the last attempt, and the success sequence starts on the tick that reaches `button.pressed`, never on `DONE`. This holds at every speed (240 / 120 / 40 ms per step) and under reduced motion, where the jump to the final frame is that tick. Mr. Pending's mood is derived from state and the current line, never stored.

**Board** (`features/board`): one inline SVG, `viewBox 0 0 720 440`, grid origin (36, 28), cell 56, so cell (c, r) centres at (64 + 56c, 56 + 56r). A pure `frame(blueprint, events, step)` gives every part (from the blueprint) and the ball (from the events) a position and a state; CSS transitions move them (120 ms per step, 40 ms impatient). Attempts after the first start on their own, with no button to press: the visitor watches, pauses or replays, never approves. Reduced motion jumps to the final frame and shows the event list. The repair diff is drawn from `attempt.patch` with symbols and words, never colour alone: removed parts dashed with an X and a "−" badge, added parts with a halo and a "+" badge, moved parts with an arrow and a label, unchanged parts faded, plus a written change list. On phones the same SVG fills the width, grid letters are hidden, only the active part is labelled, the failure cell gets a ring and a chip, and every control is at least 52 px.

**Voice** is its own small machine (`idle | loading | speaking | skipped | failed`), so a voice failure can never hide a line; the machine runs without any voice. Tiers: ElevenLabs through `/api/tts` (online), browser `speechSynthesis` restricted to `localService === true` voices (offline, default); Piper is not in v1. Data boundary: ElevenLabs receives only `source: 'table'` lines whose slots are simulator facts (numbers, cells, part kinds); a line that carries model text (the title, a memo) is captioned and spoken by browser voices only, so no request-derived text ever leaves for the voice provider and "your prompts stay here" stays true with cloud narration on. The voice control discloses this in one sentence. Pace: audio by `playbackRate` with `preservesPitch` (0.75 slow and deadpan, 1.15 excited), browser speech by its own `rate` (0.8 / 1.1); the two are separate APIs and are tested separately. Lines queue: a line plays to its end or is skipped, never cut by a visual beat. Esc skips voice; Space pauses the machine.

**Report** (`features/report`): the 1200 × 630 card is an SVG component rendered from a `ReportView` derived in the feature: `Report` for every number and the verdict, `BuildHeader` for the title and the footer copy (such as "Recorded local inference · gemma4:12b via Ollama"), and the final attempt's blueprint and events for the thumbnail only. "Save as image" rasterises it client-side. Server-rendered OG images are not in v1.

**Gallery** (`features/gallery`): static `Build` JSON in `apps/web/public/gallery/<slug>.json`, replayed with zero inference at `/r/<slug>`; it works with the agent down. CI rejects a gallery record whose `model.host` is not `ollama`. Three kinds of record, kept distinct: a gallery record is hosted and has a public URL; a personal build lives in "My department" (`localStorage`, last 20 builds) and leaves only as a JSON export or an image, never as a link; a private hosted record with a random expiring URL is not in v1. The cosmetic `DUE-nnnn` number is a per-browser counter, never an address. Any imported or opened record is untrusted: the app checks its `rulesVersion`, re-simulates every attempt and recomputes the report before showing it.

**Errors.** React boundaries (root + per feature) catch render errors only; fetch, stream and abort failures become `FAIL` events with a typed `AppError`. One copy table, `features/build/model/errors.ts`, maps each code to its message and action.

## 4. Agent (`apps/agent`)

```
src/env.ts                zod-parsed env; crash on boot if invalid
src/mastra/index.ts       Mastra({ agents }); no observability exporter is configured
src/agents/pending/       instructions (PROMPT_VERSION), style rules quoted from the character sheet; no tools
src/models/registry.ts    allowlist; one inference mode per deployment
src/build/loop.ts         design → validate → simulate → repair, bounded; emits stream events; writes Build
src/build/beats.ts        the narration table; fills slots from Attempt and Patch only
src/http/                 build (NDJSON stream), config, tts (ElevenLabs proxy), identity, rate-limit, cors
```

The server owns every secret, every model call, the simulator run of record, all validation and all limits. The browser never sees a key.

| Route | In → out | Notes |
|---|---|---|
| `POST /api/build` | `Form` → NDJSON `partial · line · attempt · patch · done · error · ping` | the whole loop; limits in the contract |
| `GET /api/config` | → `{ inference, model, voice: { elevenlabs }, telemetry, repairs, contractVersion, rulesVersion }` | one fetch on mount |
| `POST /api/tts` | `{ requestId, lineId }` → `audio/mpeg` | table lines only |
| `GET /healthz` | → `200` | warmup and uptime |

These routes exist only in the local installation; the public static site calls none of them. Outbound from the agent, and nothing else: Ollama (`OLLAMA_URL`, local mode) or OpenRouter (hosted mode) through Mastra; ElevenLabs (optional). No runtime MCP servers, no agent tools: Gemma proposes blueprints and patches and nothing more.

**The loop.** `agent.stream(input, { structuredOutput: { schema: DesignReply, errorStrategy: 'strict' }, tracingOptions: { hideInput: true, hideOutput: true }, abortSignal })` (option names as documented for the pinned Mastra version; `'strict'` is the documented default and throws on an invalid object); `objectStream` becomes `partial` events, `object` is validated against the Form and the catalogue, simulated, and sent as `attempt`. While the outcome is not `pressed` and repairs remain (`REPAIRS = 2` in the app, 5 in the eval), a repair call receives a failure brief (outcome, `failedAt`, the last five events, violations, the current blueprint, the constraints) and answers with `RepairReply`; `applyPatch` makes the next blueprint. A reply that fails the schema is re-asked once with the zod issues; a second failure is `MODEL_INVALID`. The loop ends with `done { header }`.

**Model runtime (initial, measured in the eval, not fixed).** `gemma4:e2b` first, `gemma4:e4b` for comparison; thinking off (with thinking on and a small token budget the model spent every token thinking and returned nothing, measured 21 Oct); the derived JSON Schema as the structured-output constraint; temperature about 0.2; context 4096; bounded output; one inference at a time, since the laptop's GPU memory is shared system RAM. The instructions describe every footprint cell by cell and say that dominoes carry an impulse, not the ball, because the measured failures were overlaps and handoffs, not JSON.

**Inference modes.** `INFERENCE_MODE` is `local` (Gemma 4 via Ollama beside the agent, `OLLAMA_URL`) or `hosted` (Gemma 4 via OpenRouter). Exactly one per deployment, no automatic fallback across that boundary: if Ollama is down the user gets `MODEL_UNAVAILABLE` and a retry, never the cloud. The badge speaks about the model only. The server, which alone knows where the model is, answers `/api/config` with `inference: 'this-machine' | 'server' | 'hosted'`: `this-machine` only when the mode is `local`, `OLLAMA_URL` points at a loopback address and the request itself arrived from a loopback address; `server` for any other `local`; `hosted` otherwise. The client renders copy from that field and nothing else:

- `this-machine`: "Gemma runs on this machine. Your prompts stay here."
- `server`: "Gemma runs on the Mr. Pending server. Your prompts go to that server, not to a model provider."
- `hosted`: "Gemma runs hosted via OpenRouter. Your request is sent to OpenRouter."

**Offline.** Local inference is not the same as offline; voice and telemetry are disclosed at their own controls. The app claims "works offline" only when both hold: `INFERENCE_MODE=local` and browser voices. That claim is proven by a test that completes a build with outbound network blocked. Sentry is cut for this release, so telemetry is always off and `/api/config` reports `telemetry: false`. ElevenLabs gets `Line.text` only.

**Deployments.** The local installation (`INFERENCE_MODE=local`) runs on ordinary hardware: the development and recording machine is a laptop with 16 GB RAM and integrated graphics, so the shipping model is the smallest Gemma 4 that designs and repairs well enough, found by measurement in the eval (E2B first, then E4B; 12B only if it fits). It exports builds to the gallery with `eval/run.ts --gallery`. The public site is the `static` build: no agent, no API, no secrets, labelled "Recorded local inference"; its unlisted preview on Render deploys from `main`, and every deploy is started by hand (`render.yaml`, automatic deploys off). `hosted` remains a supported agent configuration for local experiments and eval comparison; it is not deployed, and live generation on the public site is a later enhancement, not part of this release.

## 5. Eval (`eval/`)

`scenarios.json` holds five headline forms, one held-out form (written after the instructions were frozen and never used while tuning them) and one injection trap. `run.ts` builds each *k* times against one model, one `PROMPT_VERSION` and one settings set, with up to five repairs and one model loaded at a time, and writes `results/<date>-<model>-<promptVersion>.json` and `.md`. The experiments are a bounded progression: **A** baseline instructions, **B** mechanical instructions (footprints cell by cell, movement and handover rules, constraints), **C** simulator-guided repair, measured on B's runs, **D** the best of these on E4B. Reported separately: schema validity, catalogue validity with violation kinds, failure kinds by terminal event, repair validity (a `RepairReply` that parses and applies without violations), outcome-changing repairs, presses and which attempt pressed, design and repair latency p50/p95 with loading separated, tokens, RAM headroom, and whether repair latency stayed under the animation length; the held-out form and the trap in their own rows, outside the headline rates. Only measured numbers from these files appear anywhere; nothing is estimated, and a difference is always quoted with its sample size. Inference-time only: no fine-tuning, no LoRA, no training infrastructure.

## 6. Code rules

**TypeScript.** Every package: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; DOM lib only in `apps/web`, Node types only in the agent and the eval. Forbidden by lint: `any`, `@ts-ignore`, `@ts-nocheck`, non-null assertions, double assertions, rule-wide disables; `as const`, `satisfies` and a narrowly scoped, justified assertion are fine. A type error is corrected in the design, never silenced. External data is `unknown` until a zod parse; types are only `z.infer`'d, never duplicated as interfaces. Multi-condition state is a discriminated union and every `switch` ends in `assertNever`. Named exports only, except `React.lazy` chunks.

**Clean code.** Self-documenting names, small functions, obvious control flow; comments are one line and explain *why*. An abstraction (helper, hook, factory, dependency) is introduced only when it improves cohesion, readability, testability or real reuse; a one-caller helper that isolates complex or testable behaviour qualifies, a wrapper that renames something does not. No dead code, no speculative features, no duplicated logic: one implementation per responsibility, one source of truth per contract and per copy table. No magic values: limits are named constants in `contract` and `env.ts`. Small cohesive modules with clear ownership, neither monoliths nor one-function files. Tests assert behaviour at boundaries (simulator, validation, repair, streaming, accessibility, security, end to end); no snapshots, no duplicated cases, no coverage target. CI enforces unused code, `any`, import boundaries, formatting, types, tests, build, fixtures replay, secret scan.

**Components.** Presentational, explicit props, composition over configuration. Model text is rendered as text, never HTML. Styling is CSS Modules and native CSS, nothing else: each component's rules in a `*.module.css` beside it (scoped by Vite, no dependency), design tokens as custom properties in `styles/tokens.css`, a minimal `styles/global.css` (reset, fonts, body), grid and flex, container queries where a card reflows; the rig and the board are inline SVG styled through the same modules; motion is CSS transforms, transitions and keyframes under `prefers-reduced-motion`. No Tailwind, Sass, CSS-in-JS or component framework.

**Accessibility is part of done**, measured as WCAG 2.2: complete AA, every applicable AAA criterion met and tested, and no AAA conformance claim for the whole app unless the whole app qualifies. Concretely: text contrast ≥ 7:1 with the tokens in the character sheet; targets ≥ 44 px (ours are 52); every board event exists as text in the Minutes list and Mr. Pending's lines are `aria-live="polite"`; every control works by keyboard with visible focus; reduced motion keeps every state legible; 400 % zoom reflows without horizontal scroll; captions for every spoken line. axe runs inside the Playwright suite on every page state and the README carries the short manual checklist (screen reader, keyboard-only, zoom); a Lighthouse score is never cited as conformance.

**Hooks and memoisation.** Logic in `use*` hooks, thin components, typed return objects. Cancellation belongs to the owner of a cancellable operation: the build client and the voice player each own one `AbortController`, abort on unmount and on a new request, and pass the signal down; other hooks do not grow one by rule. `useEffect` only syncs with the outside world. React Compiler via Oxc (`react({ compiler: true })`); no manual `useMemo`/`useCallback`/`memo` without a comment naming a measured reason.

## 7. Latency budget

| Moment | Target | How |
|---|---|---|
| Keypress / click feedback | < 50 ms | reducer first, network after |
| First paint (cold, 4G) | < 1 s | one app chunk, inline critical CSS, self-hosted woff2 fonts with `font-display: swap`, no recordings in the first chunk |
| First part on the board | measured in the eval; shown as a drawing animation | `title` and `parts` stream first |
| One attempt animated | steps × 120 ms, ≤ 24 s at the 200-step cap; the repair hides behind it when its p50 is shorter | client pace, independent of the model; measured per model in the eval |
| Gallery replay | zero inference, < 1 s | static JSON, same simulator |
| Server cold start | none in production | always-on instance, health-check warmup |

## 8. Tooling

Vite+ for dev, build, test and check (`vp dev`, `vp build`, `vp test`, `vp check` = oxfmt + oxlint + tsgolint; type checking runs only with `lint.options.typeAware` and `typeCheck` both on in the root `vite.config.ts`, which governs every workspace package, so both are on). Bun is the package manager and script runner (Bun workspaces, `bun.lock`); Node 24 runs the agent. Vite+ detects pnpm, npm and Yarn only, so "Bun installs, `vp` checks" is verified at bootstrap; if it fails, the fallback is plain Vite 8 + Vitest + oxlint/oxfmt through `bun run` scripts, same layout. Vitest + Testing Library + MSW for unit and component tests; Playwright (with axe) for pressed, exhausted, error, offline, keyboard-only and phone. CI is one GitHub Actions workflow: `permissions: contents: read`, actions pinned by SHA, `setup-bun` with `bun install --frozen-lockfile`, Node 24, then check → types → test (including fixture and gallery replay) → build → `bun audit` → secret scan → the built site uploaded as the release artifact.

## 9. Repository policy

The repository holds software only: code, tests, fixtures, recorded builds, assets, a licence, the documents that serve them (README and NOTICES at the root, the four specifications in `docs/`) and the two agent instruction files with their scope hook (`AGENTS.md`, `CLAUDE.md`, `.claude/`). Process notes, drafts, delivery notes, sprint planning, issue sources, pre-production mockups and generated Graphify indexes (`graphify-out/`) stay outside it; the sprint lives in GitHub issues and a Project. Graphify is a developer navigation aid, never a runtime dependency or a substitute for module boundaries. The README describes Mr. Pending as an independent open-source application: what it does, how to run it locally with Ollama, how the gallery was produced, how to test it, its limits, how to contribute.

**Not in v1**, and never described as present: Piper voice, private replay links, server-rendered OG images, overnight builds, open-ended conversation with Mr. Pending (v1 has the Form and the narration only).
