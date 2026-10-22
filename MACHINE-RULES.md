# Mr. Pending: Machine Rules

The rules of the board, the parts and the simulator. `packages/machine` implements exactly this and exports `RULES_VERSION`; the fixtures in §7 are the acceptance test. The model sees a plain-language version of §1–§4 in its instructions; if the rules change, bump `RULES_VERSION`, change this file first, then the instructions, then the fixtures. Design mockups are a visual target, never a mechanics specification.

## 1. Board

- 12 columns `A`–`L` (west to east) × 7 rows `1`–`7` (top to bottom). Gravity points to row 7.
- `A1` holds the hopper, `L7` the button. Both are fixed, drawn by the renderer and never listed in a blueprint.
- One ball. It starts in the hopper and is released at step 1 into `A2`.
- A blueprint is 2–14 parts of the six placeable kinds below, placed by the model. Everything else is empty air.
- Time is discrete: one step is one event. The run stops at `button.pressed`, `ball.lost`, `ball.stopped`, `impulse.lost` or step 200.

## 2. Catalogue

Six placeable kinds; the hopper and the button are fixed board objects, not parts. Each part has an anchor `cell`, a direction `dir` (`east` or `west`) and exactly the parameter its kind needs: `length` for conveyor, ramp and dominoes, `power` for catapult and fan, none for seesaw; the contract and the model-facing schema both require it per kind. Footprints are the cells a part occupies, and the model's instructions list them cell by cell, because the measured failures of a small model are overlaps and handoffs, not syntax.

| Kind | Footprint from `cell` | Parameter | When the ball enters | Exit |
|---|---|---|---|---|
| `conveyor` | `length` cells in one row, toward `dir` | `length` 2–6 | moves one cell per step toward `dir` | the cell beyond the last one, same row, then gravity |
| `ramp` | `length` cells, each one column toward `dir` and one row down | `length` 2–4 | moves one cell diagonally down per step | the cell beyond the bottom one, same row, then gravity |
| `dominoes` | `length` cells in one row, toward `dir` | `length` 2–5 | the ball stops and becomes the trigger; from the domino it hit, one domino falls per step toward `dir` | the last domino delivers an impulse to the next cell in `dir`: the button is pressed, another `dominoes` part is triggered, anything else is `impulse.lost` |
| `seesaw` | three cells in one row; `cell` is the pivot, the launching end points toward `dir` | — | a ball arriving from above on the load end (opposite `dir`) is launched in an arc to three columns toward `dir` and two rows up from the pivot row; a ball arriving anywhere else on the plank stops | the landing cell, then gravity or that cell's entry rule |
| `catapult` | one cell | `power` 2–5 | fires the ball in an arc to `power` columns toward `dir` and two rows up | the landing cell, then gravity or that cell's entry rule |
| `fan` | one cell; its wind covers the next `power` cells toward `dir` in the same row | `power` 1–4 (reach) | the fan cell is solid: a ball entering it stops | while the ball is in an empty wind cell it moves one cell toward `dir` per step instead of falling, so from the last wind cell it is pushed one cell beyond the reach; there, outside the wind, gravity resumes |

Arcs are instant: one `ball.launched` event from the start cell to the landing cell, which the renderer draws as a curve. A landing cell outside the board is `ball.lost` at the board cell nearest to it (column and row clamped), with `edge` naming the side it left; any horizontal move off the edge is `ball.lost` at the last cell on the board.

## 3. Gravity, landing and the button

- A ball in a cell with no part falls one row per step. A ball that reaches row 7 in an empty cell comes to rest: `ball.stopped`.
- A ball falling into a part's cell follows that part's entry rule. A ball leaving a part into a cell that holds another part follows that part's entry rule at once: this is how parts hand over.
- **The button is pressed only by physics:** the ball entering `L7` while moving (falling, rolling, landing from an arc) or the impulse of a domino falling into `L7`. The event is `button.pressed { by: 'ball' | 'domino' }`. A ball resting in `K7`, a part pointing at the button, or a blueprint that "looks finished" is not a press. The renderer depresses the button on this event only.

## 4. Events and outcomes

```ts
const step = z.number().int().min(0).max(200);
export const SimEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ball.released'), step, cell: Cell }),
  z.object({ type: z.literal('ball.moved'),    step, from: Cell, to: Cell, by: z.enum(['gravity', 'conveyor', 'ramp', 'fan']) }),
  z.object({ type: z.literal('ball.launched'), step, from: Cell, to: Cell, by: z.enum(['seesaw', 'catapult']), part: PartId }),
  z.object({ type: z.literal('domino.fell'),   step, part: PartId, index: z.number().int().min(0).max(4), cell: Cell }),
  z.object({ type: z.literal('impulse.lost'),  step, cell: Cell }),
  z.object({ type: z.literal('ball.lost'),     step, cell: Cell, edge: z.enum(['top', 'bottom', 'west', 'east']) }),
  z.object({ type: z.literal('ball.stopped'),  step, cell: Cell }),
  z.object({ type: z.literal('button.pressed'), step, by: z.enum(['ball', 'domino']) }),
]);
```

| Outcome | When | `failedAt` |
|---|---|---|
| `pressed` | `button.pressed` | — |
| `lost` | `ball.lost` | the `cell` of that event |
| `stalled` | `ball.stopped` or `impulse.lost` | the `cell` of that event |
| `stalled` | step 200 reached without a stop (a ball circling in wind, say) | the ball's cell at step 200; the log ends with `ball.stopped` there |
| `invalid` | validation failed; nothing was simulated | — |

Every event carries `step`; the renderer's `frame(blueprint, events, step)` draws the parts from the blueprint and folds the events up to `step` for the ball and the fallen dominoes, so the event log is the animation. A **handover** is derived from the log, never recorded: the ball or an impulse enters the footprint of a placed part or the button, having last been inside a different placed part (a fan's wind cells count as its footprint here; the hopper does not count). The first handover of an attempt triggers the `handoff` beat.

## 5. Validation

`validate(blueprint, form)` returns a list of violations in plain words, empty when the blueprint is sound:

1. Schema (`Blueprint` in the contract); ids unique; the parameter each kind needs is present and in its range.
2. Every footprint inside the board; no footprint overlaps another, `A1` or `L7`.
3. No cell lies in the wind of two fans, whatever their directions; conflicting wind is rejected here rather than resolved by a precedence rule.
4. Part count within `minParts`–`maxParts`; `required` kind present; `forbidden` kind absent.

Any violation makes the attempt `invalid`: it counts as an attempt, it is not simulated, and the repair brief quotes the violations. The model is never told how to fix them, only what is wrong.

## 6. Repairs

A `Patch` is one to four ops applied in order to the previous blueprint: `add` a part whose id has not been used by any attempt of this build, `move` a part to a new anchor (parameters kept), `remove` a part. An unknown or reused id is a violation. Changing a parameter is `remove` + `add` under a new id. The result is validated like a fresh blueprint and becomes attempt *k*+1, which carries the patch (`attempts[k+1].patch`); attempt 1 never has one. The app allows two repairs per build, the eval five. The failure brief the model receives contains the outcome, `failedAt`, the last five events, the violations, the current blueprint and the Form constraints, in words and JSON, nothing else.

## 7. Fixtures (`packages/machine/fixtures/`)

Each fixture is a complete `Form`, a blueprint with ids `p1, p2, …` in the order listed, and its `events.json`. The events are recorded by running the simulator once and checking every line by hand against §2–§4, never typed from this table; from then on `simulate` must reproduce them byte for byte. The form is `{ nature: 'Press the blue button. Scenic route, please.', minParts: 2, maxParts: 14 }` unless stated. They exist before any model is called.

| Fixture | Blueprint | Expected |
|---|---|---|
| `pressed` | conveyor `A2` east 4 · ramp `E2` east 4 · dominoes `I7` east 3 | ball rides, descends, falls onto the dominoes at `I7`; three fall; `button.pressed { by: 'domino' }`; three handovers |
| `lost` | `pressed` + catapult `p4` at `I5` east 5, where the ball used to fall | `ball.launched` off the board; `lost`, `failedAt: 'L3'`, `edge: 'east'` |
| `repaired` | `lost` + patch `[remove p4]` as attempt 2 | back to `pressed`; the diff shows one removed part |
| `stalled` | conveyor `A2` east 4 · dominoes `I7` east 2 (never reached) | ball falls from `E2` to `E7`; `stalled`, `failedAt: 'E7'`; the dominoes stand |
| `seesaw` | ramp `A2` east 3 · seesaw pivot `E6` east · fan `G4` east 2 · dominoes `J7` east 2 | ramp → load end `D6` → launched to `H4` → wind moves it `I4`, `J4` → falls `J5`, `J6` onto `J7` → `pressed`; four handovers |
| `catapult` | conveyor `A2` east 2 · ramp `C2` east 3 · catapult `p3` `F6` east 2 · fan `H4` east 2 · dominoes `p5` `I7` east 2; form `required: 'catapult'` | fired from `F6` onto the fan's own cell `H4`; `stalled`, `failedAt: 'H4'` |
| `catapult-repaired` | `catapult` + patch `[remove p3, add p6 catapult F6 east 4, move p5 to J7]` as attempt 2 | lands in the wind at `J4`, pushed to `K4`, falls onto `K7`; one domino falls; `pressed`; `applyPatch` reproduces the blueprint |
| `invalid` | form `{ nature: 'No fans. I dislike wind.', minParts: 2, maxParts: 6, forbidden: 'fan' }`; ramp `C2` east 3 · ramp `D3` east 2 · fan `H4` east 2 | violations: overlap at `D3` and `E4`, forbidden fan; no events, `outcome: 'invalid'` |

The seesaw fixture is the proof that parts interact: remove the fan and the same blueprint must be `stalled` at `H7`. The catapult pair is the story the mockups tell.

## 8. Not rules

No friction, mass, speed or angles. No second ball. No part that reads the user's text. Nothing random: two runs of the same blueprint are the same bytes, on any machine, in any browser.
