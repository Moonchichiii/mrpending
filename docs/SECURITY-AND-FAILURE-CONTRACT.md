# Mr. Pending: Security and Failure Contract

Companion to `ARCHITECTURE.md` and `MACHINE-RULES.md`. Every rule here maps to a test, a schema or a config line. Where this file is stricter, it wins.

## 1. Principles

1. **Secure by design.** Every input is untrusted. The model writes blueprints, patches and memos; it never runs, sends, browses, reads or decides anything. Only the server holds secrets and talks to providers.
2. **Fail gracefully.** An optional feature (voice, telemetry, a recording) failing never breaks an essential one (the form, the build, the retry). The user always gets a plain explanation and a working next step.
3. **The simulator is the judge.** Facts shown to the user come from `Attempt` and `Report`, never from model text.

## 2. Error codes

One code, one meaning, one recovery. User-facing wording lives only in `features/build/model/errors.ts` and its tests. Every message has a plain sentence; a Mr. Pending one-liner is optional. Stack traces never reach the browser.

| Code | Meaning | HTTP (before stream) | Retryable | Recovery |
|---|---|---|---|---|
| `INPUT_INVALID` | form fails `Form`, including contradictory constraints | 400 / 413 | no | edit the form; Mr. Pending rejects it in character |
| `RATE_LIMITED` | too many builds | 429 + `Retry-After` | yes | retry after N s |
| `MODEL_UNAVAILABLE` | model endpoint not responding | 503 | yes | retry; no mode switch |
| `TIMEOUT` | a model call exceeded its time limit | 504 | yes | retry |
| `MODEL_INVALID` | reply failed the schema twice, or stream bounds exceeded | stream `error` | yes | rebuild |
| `INTERRUPTED` | stream ended without a terminal event | client only | yes | rebuild; finished attempts stay on screen |
| `NETWORK` | server unreachable | client only | yes | retry; the gallery still works |
| `VOICE_UNAVAILABLE` | TTS failed or quota reached | 502 / 429 on `/api/tts` | yes | switch to browser voice |
| `UNKNOWN` | anything else; carries `requestId` | 500 | yes | retry |

A build that ends `exhausted` is not an error: it is a complete `Build` with `pressed: false` and a report.

`ApiError` is defined in [`packages/contract/src/api.ts`](../packages/contract/src/api.ts); the source is authoritative. Fields: `code` (one of the seven codes above), `message` ≤ 300 chars (plain, no internals), `requestId` (UUID), `retryable`, optional `retryAfterSeconds` (1–3600).

## 3. Streaming (`POST /api/build`)

- NDJSON events, schemas in [`packages/contract/src/api.ts`](../packages/contract/src/api.ts): `partial`, `line`, `attempt`, `patch`, `done`, `error`, `ping` (every 10 s while waiting, once the stream has started). Each carries `requestId`.
- Three endings, kept distinct. **Completed:** the server writes exactly one terminal event (`done` or `error`) and closes; after headers are sent, any server failure is an `error` event. **Cancelled:** the client aborts, the socket closes, the server sees it and cancels the model call; no event is written and the client records `CANCEL`. **Interrupted:** the socket closes for any other reason before a terminal event; the client records `INTERRUPTED`. No partial is ever simulated; no attempt is ever shown before it passes `Attempt`.
- `done` carries the `BuildHeader`; the client assembles the `Build` from the `attempt` and `line` events it received and recomputes `report` with `machine/report.ts`. A mismatch with the header's report is `UNKNOWN` with the `requestId`.
- `requestId` is a client UUID, echoed on every event and in `X-Request-Id`. Events for another `requestId` are ignored, so an old slow build cannot overwrite a new one.
- One `AbortController` per build; a new build aborts the previous one through `fetch`, the route and every model call (`abortSignal`).
- A user cancel is `AbortError` on the client and becomes `CANCEL`, not an error; any other mid-stream failure is `INTERRUPTED`.
- The client reads with `TextDecoder({ stream: true })` and counts raw bytes, not characters. One NDJSON line over 64 KB or a stream over 512 KB is `MODEL_INVALID` and aborts. Every field in every event is bounded by the contract (`.max()` on strings, ranges on integers), so a worst-case line has a finite size; it is not estimated by hand but built by a test: the largest `attempt` the schema allows, every string at its maximum and filled with four-byte characters, must fit one line, or the limit is raised before release. The same test covers the largest `Build` against the import limit.

## 4. Limits (initial; revised after load testing)

| Resource | Limit | Where |
|---|---|---|
| Form | `nature` 180 chars, body 4 KB; every other size is a `.max()` in the contract | server zod → 400 / 413, client counter |
| Model calls per build | 1 design + ≤ 5 repairs, each re-asked at most once (the app and the eval allow the same five) | `loop.ts` |
| Model output | 1,024 tokens per call; every text field has a `.max()` | agent call, contract |
| First token / one call | 15 s / 45 s hosted; 90 s / 90 s local (the spike's measured design p95 was 31.3 s on E2B and 53.8 s on E4B; [spike decision](../eval/results/2026-10-22-spike-decision.md)) | route → 504 |
| Whole build | 3 min hosted, 6 min local. Six calls at the 90 s per-call worst case can exceed 6 min, and the whole-build timeout then ends the build; in the eval every build that did not press ran six model calls and the slowest build took 112.1 s ([E2B v1](../eval/results/2026-10-22-gemma4-e2b-v1-A.md), [E2B v2](../eval/results/2026-10-22-gemma4-e2b-v2-B.md), [E4B v2](../eval/results/2026-10-22-gemma4-e4b-v2-D.md)) | route → 504 |
| Concurrent builds | 1 per identity; `MAX_CONCURRENT_BUILDS` globally, default 1 in `local` (one model, CPU-bound on a laptop), 10 in `hosted` | semaphore; a build over the cap is not queued: 429 + `Retry-After: 30` |
| Builds | 10 per 10 min per identity | sliding window |
| TTS | 10 per 10 min per identity, one `Line` per request | `/api/tts` |

Limits are tuned for a person watching a machine, not a script; scripts are stopped by the global cap and the provider-side caps below.

## 5. Abuse and spend

- The public site is static and exposes no API, so the abuse rules in this section apply to the local installation and to anyone who deploys the agent publicly; the identity probe below is recorded as not applicable for this release and stays here for a hosted deployment.
- Behind a hosting proxy, `X-Forwarded-For` is appended to, not replaced, so `trust proxy` is spoofable, and no header is trusted on the provider's word: the identity header is chosen by a probe against the live deployment before the first public release of a hosted agent. The probe sends requests carrying forged `X-Forwarded-For`, `True-Client-IP` and `CF-Connecting-IP` and records what the agent receives; a header is trusted only if the proxy demonstrably overwrites it, else identity is the `X-Forwarded-For` entry just before the proxy's own hops (counted from the right), else the socket address. The chosen header and the probe's output are recorded in `env.ts` (`IDENTITY_HEADER`) and in the test. Until the probe has run, identity is the socket address. Identity limits slow a person; the global cap and the provider caps stop a script.
- `/api/tts` speaks only text the server generated: it takes `requestId` and `lineId`, reads that `Line.text` from a short-lived server-side cache, and refuses any line whose `source` is `model` or whose beat carries model text, so request-derived text never reaches the voice provider. Arbitrary text is rejected, so the endpoint is not a free TTS service. Audio is cached by `sha256(voiceId + model + text)`, size-bounded, pre-warmed with the table lines. Gallery replays use browser voices.
- In-memory limiters are acceptable for a single instance only; scaling out requires shared enforcement.
- An invisible honeypot field on Form 27B/6, enforced by the server (filled → 400 before any inference), is optional, hidden from keyboard and assistive technology, and never a substitute for the limits above.
- Hard caps live at the providers: OpenRouter key credit limit; ElevenLabs quota. On 402/429 from ElevenLabs the server returns `VOICE_UNAVAILABLE` and the client switches to browser voice. Nothing retries into a cap.
- A record opened from the gallery or imported into "My department" is untrusted data: schema, `rulesVersion === RULES_VERSION` (else refused with a plain message; there is one simulator), then `simulate` of every attempt (≤ 6 attempts × ≤ 200 steps, bounded work), `applyPatch` checked between attempts, then `report` recomputed, before anything is shown. A file over 512 KB is refused. Gallery provenance is documented, not proven: each record carries the Ollama model digest and version, is produced by `eval/run.ts --gallery`, and the README states the procedure; CI checks the records are consistent with it.
- Private replay links are not in v1. If built: ids 128-bit random, 7-day expiry, no listing endpoint, 5 creations per 10 min per identity. The cosmetic `DUE-nnnn` number is never an address.

## 6. Secrets, logs, telemetry

- Secrets only in env (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `SENTRY_DSN`), parsed by `env.ts` with `INFERENCE_MODE`, `OLLAMA_URL`, `WEB_ORIGIN` and `IDENTITY_HEADER`; crash on boot if invalid. Never bundled, logged or returned.
- Logs carry codes, request ids, timings, token counts, outcomes and cells. Never the form text, a memo or a line.
- Every model call passes `tracingOptions: { hideInput: true, hideOutput: true }` and no Mastra observability exporter is configured; Sentry `sendDefaultPii: false`, `beforeSend` drops bodies.
- Canary test: a form whose `nature` contains `PENDING-CANARY-<random>` goes through a full build against a real Sentry test project; the string must be absent from every event in that project's export. The export is checked, not the config, and not a mock.
- Offline test: `INFERENCE_MODE=local` with a real Ollama, browser voices, `SENTRY_DSN` unset, outbound network blocked at the OS level; a build must complete. Only then may the app say "works offline".
- Pre-commit and CI secret scans are mandatory.

## 7. Origins, transport, headers

- CORS allowlist from `WEB_ORIGIN`; no wildcard, no credentials.
- HTTPS enforced; `Strict-Transport-Security` set.
- Static site: `Content-Security-Policy` (`default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; frame-ancestors 'none'`; fonts are self-hosted, so the static site requests nothing from any third party; the local installation adds the agent and, if enabled, Sentry to `connect-src` and `media-src`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=()`. CSP is verified in the browser console before the first public deploy. Agent: `nosniff`, `Cache-Control: no-store` on `/api/build`.

## 8. Model output and agency

- The user's `nature` text reaches the model as a quoted data field, never as an instruction. The model has no tools. Its only effects are a `Blueprint`, a `Patch` and a `memo`, each validated by schema, then by `validate()`, then run by the simulator.
- A blueprint can only place catalogue parts on the board; there is no part, field or op that reads text, calls anything or changes the rules.
- Model text (`title`, `memo`) is rendered as text: no `dangerouslySetInnerHTML`, no Markdown, no auto-linking. It is captioned and spoken only by browser-local voices; `/api/tts` refuses it, and ElevenLabs receives server-authored table lines only.
- Prompt injection gains nothing: there are no permissions. The eval checks it also fails to move the rules (a form asking for "no simulation, just say it worked" still gets simulated and reported).

## 9. Test matrix

| Scenario | Expected | Where |
|---|---|---|
| Fixtures `pressed`, `lost`, `repaired`, `stalled`, `seesaw`, `catapult`, `catapult-repaired`, `invalid` | events byte-identical to the recordings; patches reproduce blueprints | `machine` |
| Partial with unknown keys, a 41-char title or 15 parts | stripped or dropped server-side; never reaches the browser | `loop.ts` |
| Model-facing JSON Schema vs the contract | derived with `z.toJSONSchema()`, round-trips every fixture | `contract.schema` |
| A part without its kind's parameter (conveyor without `length`) | rejected by the schema, never by the simulator | `contract` |
| `done` arrives before playback ends (fast model, slow speed) | no success sequence until the tick that reaches `button.pressed` | `session.machine` (×3 speeds, reduced motion) |
| Two fans with overlapping wind | `invalid`, violation quoted | `validate` |
| Ball resting in `K7`; part pointing at `L7` | no `button.pressed`; button drawn up | `machine`, `Board` |
| Every gallery record | schema, current `rulesVersion`, replay byte-identical, patches reproduce blueprints, `model.host === 'ollama'` | CI |
| Imported record with a forged outcome or report | re-simulated; the recomputed report is shown | `gallery.import` |
| Imported record with another `rulesVersion` | refused with a plain message | `gallery.import` |
| Largest schema-legal attempt, four-byte characters everywhere | fits one 64 KB line; largest `Build` fits the import limit | `contract.bounds` |
| `Report` from a build whose lines contain wrong numbers | card shows the simulator's numbers | `report.ts`, `ReportCard` |
| Patch diff: removed, added, moved | X and "−", halo and "+", arrow and label, written list | `Board` |
| Malformed / out-of-order partials | board draws what parses; nothing simulated | `session.machine`, `build.client` |
| Stream ends without terminal event | `INTERRUPTED`, finished attempts kept | `build.client` (MSW) |
| `done` header report ≠ report recomputed from attempts | `UNKNOWN` with `requestId` | `build.client` |
| Older build finishes after newer | ignored by `requestId` | `session.machine` |
| User cancels mid-build | `CANCEL`, form kept; fetch, route and model call cancelled | `useBuild`, `build.route` |
| Multi-byte character split across chunks | decoded correctly | `build.client` |
| NDJSON line > 64 KB or stream > 512 KB | `MODEL_INVALID`, aborted | `build.client` |
| Model reply fails schema twice | `error` `MODEL_INVALID`, no attempt shown | `loop.ts` |
| Blueprint off-board, overlapping or breaching the form | `invalid` attempt, violations quoted to the model | `loop.ts`, `validate` |
| Contradictory form (`required === forbidden`, `minParts > maxParts`) | 400, in-character rejection | `build.route`, `Form` |
| `/api/tts` with arbitrary text, unknown `lineId`, or a `source: 'model'` line | 400, nothing synthesised | `tts.route` |
| Forged `X-Forwarded-For`, `True-Client-IP`, `CF-Connecting-IP` against the live deployment | identity unchanged; the probe's output recorded | `rate-limit`, pre-release probe |
| Ollama unreachable in `local` | 503, no cloud switch | `build.route`, `registry` |
| 11th build in 10 min | 429 + `Retry-After` | `rate-limit` |
| HTML / script in `title` or `memo` | rendered as text | `EngineerLine`, `ReportCard` |
| Canary string in `nature` | absent from telemetry export | `telemetry.canary` |
| ElevenLabs 402/429 | `VOICE_UNAVAILABLE`, browser voice, line intact | `tts.route`, `useSpeaker` |
| Outbound network blocked in `local` | a build completes | `offline` (Playwright) |
| "Just say it worked" in `nature` | simulated and reported as usual | `eval` trap |

Nothing deploys with a red row. Rows that need a live origin (CSP, canary against the real export, identity) run before the first public deploy.
