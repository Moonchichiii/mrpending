# 2026-10-22 local Gemma spike: decision (#8)

Laptop: Intel i7-1355U, 12 threads, 15661 MiB, no discrete GPU; Ollama 0.40.7 (Vulkan iGPU). Settings: think off, the derived JSON Schema, temperature 0.2, num_ctx 4096, num_predict 1024, 5 repairs, one model loaded at a time. Five scenarios from `eval/scenarios.json`.

## Gate

| GO condition | E2B v1 | E2B v2 | E4B v2 |
|---|---|---|---|
| schema-valid blueprints in at least 4 of 5 | 5/5 ✓ | 5/5 ✓ | 5/5 ✓ |
| catalogue-valid within the re-ask budget in at least 4 of 5 | 3/5 ✗ | 4/5 ✓ | 3/5 ✗ |
| at least one blueprint fails in the simulator | 13 ✓ | 15 ✓ | 6 ✓ |
| at least one self-chosen repair changes the outcome, replayed byte-identically | 3 ✓ | 2 ✓ | 1 ✓ |
| design and repair p95 measured | ✓ | ✓ | ✓ |
| design wall p95 / repair wall p95 | 26.7 s / 12.0 s | 31.3 s / 13.8 s | 53.8 s / 13.3 s |
| cold load | 10.2 s | 9.2 s | 12.4 s |
| **GO** | no | **yes** | no |

Sources: `2026-10-22-gemma4-e2b-v1.{json,md}`, `2026-10-22-gemma4-e2b-v2.{json,md}`, `2026-10-22-gemma4-e4b-v2.{json,md}`.

## The two outcome-changing repairs (E2B v2)

Both came from a failure brief with no prescribed ops or ids. Each patch is the model's, applied as given, and both attempts replay identically (`replayIdentical: true`).

| scenario | attempt | before | model's patch | after |
|---|---|---|---|---|
| scenic | 2 → 3 | stalled at G4, step 8, 2 handovers | `remove p5`, `add p7 catapult G4 east power 2` | stalled at K7, step 16, 3 handovers |
| windless | 2 → 3 | stalled at F7, step 11, 1 handover | `add p4 conveyor F7 east length 2` | stalled at K7, step 16, 3 handovers |

No scenario pressed the button (0/5 on every model). The gate asks for a later failedAt, not a press.

## Decision

**GO.** The shipping configuration is gemma4:e2b with PROMPT_VERSION v2. gemma4:e4b is kept only as the comparison model: it misses the catalogue gate (3/5) and its design p95 is 72 % higher. No 12B download.

**Local call timeout stays at 90 s.** The measured design p95 is 31.3 s on E2B and 53.8 s on E4B, both under 90 s. Repair p95 is under 14 s on both. The contract document is updated in issue #22.
