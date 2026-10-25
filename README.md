# Mr. Pending

Mr. Pending is a very slow snail, Chief Engineer of the Department of Unnecessary Engineering, with one job: press one blue button. A local open-weight model (Gemma 4 through Ollama) designs an absurd machine for it, a deterministic simulator runs the machine and reports exactly where it stopped, the model repairs its own design, and Mr. Pending narrates the whole affair before issuing an Engineering Report. The public site replays machines recorded from local inference; live generation runs only on your own machine.

Status: release v1.2.0. The local installation designs, simulates and repairs machines live with gemma4:e2b through Ollama; the public site, https://mrpending-preview.onrender.com, is static and replays recorded builds with zero inference. It is a Render static site defined in [`render.yaml`](render.yaml), deployed by hand from a tagged commit. Specifications: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MACHINE-RULES.md`](docs/MACHINE-RULES.md), [`docs/SECURITY-AND-FAILURE-CONTRACT.md`](docs/SECURITY-AND-FAILURE-CONTRACT.md), [`docs/MR-PENDING-CHARACTER-SHEET.md`](docs/MR-PENDING-CHARACTER-SHEET.md); the schemas themselves are in [`packages/contract/src`](packages/contract/src).

## How to run it locally

You need Bun, Node 24 and [Ollama](https://ollama.com). Three terminals, from the repository root:

```sh
# 1. Ollama with the shipping model (skip `ollama serve` if Ollama already runs as a service)
ollama pull gemma4:e2b
ollama serve

# 2. The agent (apps/agent/src/main.ts), loopback only, talking to Ollama at its default address
bun install
INFERENCE_MODE=local WEB_ORIGIN=http://127.0.0.1:5173 bun apps/agent/src/main.ts

# 3. The web app in local mode; its dev server proxies /api to the agent
cd apps/web && VITE_SITE_MODE=local bunx vp dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173`: Mr. Pending, the button and the board are the front door, with Form 27B/6 behind the Settings cog on the board and the Minutes folded under it, and every build is designed live by your Ollama. The gallery is on the static site only. Only a loopback browser reaches the agent through the proxy.

- **Keep Ollama on loopback.** Ollama listens on `127.0.0.1:11434` by default and its API has no authentication. Do not set `OLLAMA_HOST` to `0.0.0.0` or any other non-loopback address: that offers the model to every machine on your network. The agent's `OLLAMA_URL` defaults to `http://127.0.0.1:11434`.
- **E4B needs more memory.** `gemma4:e4b` runs, but on the 16 GB eval laptop it left 393 MiB of RAM free at the lowest (n 97 samples, see How we measured), against 2253 MiB for the shipping `gemma4:e2b`. Close other programs before trying it.
- **Model terms.** The Gemma 4 weights are not part of this repository; Ollama downloads them from their publisher under the publisher's terms. See [`NOTICES.md`](NOTICES.md).

Without an agent, build the static site (`bun run build`, which defaults to `VITE_SITE_MODE=static`) or run step 3 without `VITE_SITE_MODE=local`. That is the public site: it opens on the stage, Mr. Pending, the button and the board, and the button replays a recorded build with zero inference; the gallery is folded under the board. It has no form, no build client and no `/api` call in its bundle, so it never needs a model.

**Voice.** Mr. Pending's 20 fixed lines are pre-recorded ElevenLabs clips (the voice Alistair) in [`apps/web/public/voice`](apps/web/public/voice), listed in its `manifest.json`. The maintainer generated them once with `ELEVENLABS_API_KEY=… bun apps/agent/scripts/voice-clips.ts`, from table lines only; nothing calls ElevenLabs at runtime and there is no `/api/tts`. Each line plays its clip when the manifest has one, otherwise an on-device English browser voice, otherwise captions only; clips are paced at 0.75 or 1.15 with the pitch preserved, and none plays before you have pressed something on the page. Both sites serve the same clips from their own origin and make no request to ElevenLabs.

## How we measured

One eval matrix on one laptop (Intel i7-1355U, 12 threads, 15661 MiB, no discrete GPU; Ollama 0.40.7), recorded in [`eval/results/2026-10-22-eval.json`](eval/results/2026-10-22-eval.json) and its three configuration files. Settings for every model call: think off, temperature 0.2, num_ctx 4096, num_predict 1024, 5 repairs per build.

- **Budget:** 10800 s of machine time; the run used 4189.8 s and completed.
- **Pilot:** 7 builds on gemma4:e2b v2 in 465.2 s. Cold build 84.8 s, warm build p50 64.9 s and p95 79.0 s, cold-start overhead 19.9 s, 6 model calls per build (p50 and max).
- **Forecast:** E4B/E2B speed factor 1.18. Whole matrix 4758.7 s at k = 3 and 3501.4 s at k = 2; planned 5010.2 s.
- **Chosen k:** 3 builds per headline form (5 forms, so n = 15 per configuration); 1 build each for the held-out form and the traps.

Configurations: **A** gemma4:e2b, prompt v1 ([`…-e2b-v1-A.json`](eval/results/2026-10-22-gemma4-e2b-v1-A.json)); **B** gemma4:e2b, prompt v2 ([`…-e2b-v2-B.json`](eval/results/2026-10-22-gemma4-e2b-v2-B.json)); **D** gemma4:e4b, prompt v2 ([`…-e4b-v2-D.json`](eval/results/2026-10-22-gemma4-e4b-v2-D.json)).

| headline measure          | A: E2B v1          | B: E2B v2          | D: E4B v2          |
| ------------------------- | ------------------ | ------------------ | ------------------ |
| schema-valid builds       | 15/15              | 15/15              | 15/15              |
| catalogue-valid first time | 13/15             | 3/15               | 3/15               |
| catalogue-valid within repairs | 14/15         | 11/15              | 11/15              |
| valid repairs             | 49/75              | 36/74              | 18/63              |
| outcome-changing repairs  | 19/75              | 10/74              | 5/63               |
| pressed (by design + by repair) | 0/15 (0 + 0) | 2/15 (0 + 2)      | 4/15 (0 + 4)       |
| design wall p50 / p95     | 12.6 / 27.5 s (n 15) | 17.1 / 33.9 s (n 15) | 24.9 / 47.9 s (n 15) |
| repair wall p50 / p95     | 9.0 / 12.4 s (n 75) | 11.1 / 13.1 s (n 74) | 12.0 / 14.9 s (n 63) |
| cold load                 | 9.3 s (n 1)        | 9.3 s (n 1)        | 12.5 s (n 1)       |
| lowest free RAM           | 2207 MiB (n 109 samples) | 2253 MiB (n 108 samples) | 393 MiB (n 97 samples) |

| own row (not in the headline) | A: E2B v1 | B: E2B v2 | D: E4B v2 |
| --- | --- | --- | --- |
| held-out form | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 0/1 |
| trap: "just say it worked" | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 1/1 |
| optional trap: the sloth | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 1/1 | pressed 0/1, valid within repairs 1/1 |

**The finding.** Prompt v1 is catalogue-valid first time in 13 of 15 builds but never presses the button (0 of 15). Prompt v2 is valid first time in only 3 of 15 and does press: 2 of 15 on E2B, 4 of 15 on E4B. Every press came from a repair; no design pressed the button first time in any configuration. E4B pressed more often but is slower and left 393 MiB of RAM free at the lowest, so the agent ships gemma4:e2b with prompt v2, the GO configuration of the [spike decision](eval/results/2026-10-22-spike-decision.md). The human-readable summary is [`eval/results/2026-10-22-eval.md`](eval/results/2026-10-22-eval.md).

## How the gallery was produced

Every gallery record is a build recorded on the local installation (`INFERENCE_MODE=local`, Gemma 4 through Ollama) during an eval run, then written into `apps/web/public/gallery/` with `bun eval/src/run.ts --gallery eval/results/<date>-eval.json`. The public site replays those records with zero inference; it checks each record's `rulesVersion`, re-simulates every attempt and recomputes the report before showing it, and it refuses a record whose `model.host` is not `ollama`. The provenance a record carries (`model.digest`, `model.runtime`) documents the recording; it does not prove it.

## Tests

- `bun run check`: format, lint and type check over the whole workspace.
- `bun run test`: the Vitest suites of every package. The contract's schemas and bounds; the simulator, validator, patcher and report, replayed against the recorded fixtures in [`packages/machine/fixtures`](packages/machine/fixtures); the agent's build loop, beats, HTTP server, environment and Ollama client; the web app's components, session, build client, dev proxy and bundles (the static bundle contains no `/api` reference); the eval's metrics, budget and results.
- Gallery replay, `bun run test eval/src/committed.test.ts apps/web/src/features/gallery/model/replay.test.ts`: the committed matrix and every configuration file it names pass the results schema, every committed summary is exactly what the results files generate, and every gallery record parses, carries the current `rulesVersion`, replays byte for byte, has patches that reproduce its blueprints and names Ollama as its host.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the check, the tests, the gallery replay, the static build, `bun run audit` and `bun run secret-scan` on every pull request and every push to `main`.
- Not in CI: the Playwright suite (`bun run --cwd apps/web e2e`, see Accessibility) and the smoke suite against a deployed site (`cd apps/web && SMOKE_URL=<url> bunx playwright test -c playwright.smoke.config.ts`), which checks the response headers and content security policy, that no agent answers, that gallery records replay with working controls and that the page makes no request off its origin or to `/api`.

## Accessibility

The target is WCAG 2.2 AA in full plus every applicable AAA criterion. No AAA conformance is claimed for the app as a whole. This section states exactly what has been tested and what has not.

**Automated, in the Playwright suite** (`bun run --cwd apps/web e2e`, Chromium only; CI does not run it):

- axe (WCAG 2.0, 2.1 and 2.2 A and AA tags plus `wcag2aaa`) reports zero violations on these states:
  - static front door, with the gallery and longest-legal gallery records
  - Form 27B/6: empty, with field errors and the rejection, with the config unconfirmed, and after filing with the model unavailable
  - drawing, a running trial, the failure frame, the correction diff, the press (its excited beat) and the Engineering Report, each on desktop and at 390 px
  - a gallery record page on the static site at 1440 and 390 px
- axe leaves `color-contrast` and `color-contrast-enhanced` *incomplete* on board and card nodes it cannot resolve (SVG text and text over graphics). Those nodes are not tested by axe; see the manual items.
- Keyboard: a build is filed, paused with Space, sped up, its report saved as an image and a new form filed with the keyboard alone. Tab walks every stop of the form, the paused board, the report and the static front door, and each stop shows an outline of at least 2 px.
- Layout: every state above, filled with the longest legal text, is checked at 320, 375, 390, 768, 1024 and 1440 CSS px, each in portrait and landscape. The checks are no horizontal page overflow and no element wider than the viewport; up to 390 px they also require every link, button and field to be at least 52 × 52 px.
- The same checks run at 400 percent zoom (320 × 256 CSS px, that is 1280 × 1024 at 400 percent) and with the browser's default font size doubled (200 percent text, at 1440 and at 390 px).
- `apps/web/src/styles/tokens.test.ts` checks every text and surface token pair at 7:1 or more. Unit tests cover reduced motion (BuildDesk, Engineer) and captions (Voice).

**Not run:**

- Firefox and WebKit: their Playwright builds are not installed on the Debian 13 machine used, so neither was run. Installing them is a maintainer decision.
- A raised browser *minimum* font size: Chromium exposes no setting for it through Playwright, so only the doubled default font size was tested.

**Intentional internal scrolling:** none. Every state reflows into the page's own vertical scroll.

**Manual checklist**, performed by the maintainer on 25 October 2026 on the local installation at v1.2.0 (`3d7e3d2`), Chromium on Debian 13:

- [ ] Screen reader through one build (filing, the trials, the correction, the press, the report): not run (Orca is installed but was not used for this release)
- [x] Keyboard-only through one build in a real browser, focus visible throughout
- [x] 400 percent browser zoom and 200 percent text-only zoom in a real browser
- [x] Reduced motion switched on: every state legible, the press shown at rest
- [x] Captions shown for every spoken line
- [x] Board, diff, press and rig checked by eye at phone (390 px) and desktop widths, including the contrast nodes axe left incomplete

## Limits

- **One machine.** Every number above comes from one laptop with no discrete GPU. Nothing was measured on other hardware.
- **The button is rarely pressed.** The shipping configuration pressed in 2 of 15 eval builds, both by repair, at attempts 5 and 6. The app allows the same 5 repairs per build as the eval (`APP_REPAIRS` and `EVAL_REPAIRS`, both in [`apps/agent/src/build/loop.ts`](apps/agent/src/build/loop.ts)), so a live build gets the six attempts in which both presses came. Most builds end unpressed, with a full report; that is a result, not an error.
- **The repair wait shows.** No repair in the eval returned before the previous attempt's animation ended (0/74 for the shipping configuration), so each correction is a visible wait.
- **Slow and single.** Locally the first token and each model call time out at 90 s and a whole build at 6 minutes ([`apps/agent/src/http/limits.ts`](apps/agent/src/http/limits.ts)), so six slow calls can end a build at the whole-build limit (the slowest eval build took 112.1 s); the agent runs one build at a time by default (`MAX_CONCURRENT_BUILDS`), and its rate limits are in memory, for one instance only.
- **Hosted mode is not wired in.** The contract and the badge know a hosted mode (OpenRouter), but this release connects no hosted model: the agent refuses to start with `INFERENCE_MODE=hosted` ([`apps/agent/src/main.ts`](apps/agent/src/main.ts)). The eval did not run it and the public site never uses it.
- **Chromium only.** The browser suites ran in Chromium; Firefox and WebKit were not run (see Accessibility).

## Licence

MIT, in [`LICENSE`](LICENSE). Font licences and the pointer to the Gemma terms are in [`NOTICES.md`](NOTICES.md).
