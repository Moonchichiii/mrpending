# Mr. Pending

Mr. Pending is a very slow snail, Chief Engineer of the Department of Unnecessary Engineering, with one job: press one blue button. A local open-weight model (Gemma 4 through Ollama) designs an absurd machine for it, a deterministic simulator runs the machine and reports exactly where it stopped, the model repairs its own design, and Mr. Pending narrates the whole affair before issuing an Engineering Report. The public site replays machines recorded from local inference; live generation runs only on your own machine.

Status: pre-alpha. Specifications: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MACHINE-RULES.md`](docs/MACHINE-RULES.md), [`docs/SECURITY-AND-FAILURE-CONTRACT.md`](docs/SECURITY-AND-FAILURE-CONTRACT.md), [`docs/MR-PENDING-CHARACTER-SHEET.md`](docs/MR-PENDING-CHARACTER-SHEET.md).

## How the gallery was produced

Every gallery record is a build recorded on the local installation (`INFERENCE_MODE=local`, Gemma 4 through Ollama) during an eval run, then written into `apps/web/public/gallery/` with `bun eval/src/run.ts --gallery eval/results/<date>-eval.json`. The public site replays those records with zero inference; it checks each record's `rulesVersion`, re-simulates every attempt and recomputes the report before showing it, and it refuses a record whose `model.host` is not `ollama`. The provenance a record carries (`model.digest`, `model.runtime`) documents the recording; it does not prove it.

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

Open `http://127.0.0.1:5173`: the form is the front door and every build is designed live by your Ollama. Only a loopback browser reaches the agent through the proxy.

Without an agent, build the static site (`bun run build`, which defaults to `VITE_SITE_MODE=static`) or run step 3 without `VITE_SITE_MODE=local`. That is the public site: it opens on the gallery and replays recorded builds with zero inference. It has no form, no build client and no `/api` call in its bundle, so it never needs a model.

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

## Licence

MIT, in [`LICENSE`](LICENSE). Font licences are listed in [`NOTICES.md`](NOTICES.md).
