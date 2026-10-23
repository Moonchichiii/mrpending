# Mr. Pending

Mr. Pending is a very slow snail, Chief Engineer of the Department of Unnecessary Engineering, with one job: press one blue button. A local open-weight model (Gemma 4 through Ollama) designs an absurd machine for it, a deterministic simulator runs the machine and reports exactly where it stopped, the model repairs its own design, and Mr. Pending narrates the whole affair before issuing an Engineering Report. The public site replays machines recorded from local inference; live generation runs only on your own machine.

Status: pre-alpha. Specifications: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MACHINE-RULES.md`](docs/MACHINE-RULES.md), [`docs/SECURITY-AND-FAILURE-CONTRACT.md`](docs/SECURITY-AND-FAILURE-CONTRACT.md), [`docs/MR-PENDING-CHARACTER-SHEET.md`](docs/MR-PENDING-CHARACTER-SHEET.md).

## How the gallery was produced

Every gallery record is a build recorded on the local installation (`INFERENCE_MODE=local`, Gemma 4 through Ollama) during an eval run, then written into `apps/web/public/gallery/` with `bun eval/src/run.ts --gallery eval/results/<date>-eval.json`. The public site replays those records with zero inference; it checks each record's `rulesVersion`, re-simulates every attempt and recomputes the report before showing it, and it refuses a record whose `model.host` is not `ollama`. The provenance a record carries (`model.digest`, `model.runtime`) documents the recording; it does not prove it.

## How we measured

To be written from `eval/results/` once #19 lands.

## Licence

MIT, in [`LICENSE`](LICENSE). Font licences are listed in [`NOTICES.md`](NOTICES.md).
