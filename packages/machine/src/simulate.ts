import { MAX_STEPS } from '@pending/contract';
import type { Blueprint, Cell, Part, SimEvent } from '@pending/contract';
import {
  BUTTON,
  COLUMNS,
  HOPPER,
  ROWS,
  edge,
  footprint,
  onBoard,
  sign,
  toCell,
  toPoint,
  wind,
} from './catalogue';
import type { Edge, Point } from './catalogue';

type Of<K extends Part['kind']> = Extract<Part, { kind: K }>;
type Launcher = Of<'seesaw'> | Of<'catapult'>;
type Mover = Extract<SimEvent, { type: 'ball.moved' }>['by'];

// What happens next: the ball sits in a cell (`above`: it fell, was released or landed from an arc), an arc has
// left the board, or dominoes fall; `fallen` holds every domino down so far, since none falls twice.
type State =
  | { kind: 'ball'; at: Point; above: boolean }
  | { kind: 'lost'; at: Point; edge: Edge }
  | { kind: 'falling'; ball: Point; part: Of<'dominoes'>; index: number; fallen: ReadonlySet<Cell> };
type Step = { event: SimEvent; next: State | undefined };

// Validation guarantees at most one part and at most one wind per cell.
type Board = { parts: Map<Cell, Part>; wind: Map<Cell, Of<'fan'>> };

function index(blueprint: Blueprint): Board {
  const board: Board = { parts: new Map(), wind: new Map() };
  for (const part of blueprint.parts) {
    for (const p of footprint(part)) board.parts.set(toCell(p), part);
    if (part.kind === 'fan') for (const p of wind(part)) board.wind.set(toCell(p), part);
  }
  return board;
}

const ahead = (at: Point, part: Part): Point => ({ col: at.col + sign(part), row: at.row });
const clamp = (p: Point): Point => ({
  col: Math.min(Math.max(p.col, 0), COLUMNS.length - 1),
  row: Math.min(Math.max(p.row, 1), ROWS),
});
const same = (a: Point, b: Point): boolean => a.col === b.col && a.row === b.row;

// Where an arc lands, possibly off the board: a seesaw throws three columns from its pivot, a catapult `power`.
function landing(part: Launcher): Point {
  const at = toPoint(part.cell);
  const cols = part.kind === 'catapult' ? part.power : 3;
  return { col: at.col + cols * sign(part), row: at.row - 2 };
}

function move(at: Point, to: Point, by: Mover, step: number): Step {
  if (!onBoard(to))
    return { event: { type: 'ball.lost', step, cell: toCell(at), edge: edge(to) }, next: undefined };
  return {
    event: { type: 'ball.moved', step, from: toCell(at), to: toCell(to), by },
    next: { kind: 'ball', at: to, above: by === 'gravity' },
  };
}

function launch(at: Point, part: Launcher, step: number): Step {
  const land = landing(part);
  const to = clamp(land);
  return {
    event: { type: 'ball.launched', step, from: toCell(at), to: toCell(to), by: part.kind, part: part.id },
    next: onBoard(land) ? { kind: 'ball', at: to, above: true } : { kind: 'lost', at: to, edge: edge(land) },
  };
}

// The domino at `at` falls; the rest of the part follows toward `dir`, one per step.
function hit(part: Of<'dominoes'>, at: Point, ball: Point, fallen: ReadonlySet<Cell>, step: number): Step {
  const index = Math.abs(at.col - toPoint(part.cell).col);
  const cell = toCell(at);
  return {
    event: { type: 'domino.fell', step, part: part.id, index, cell },
    next: { kind: 'falling', ball, part, index: index + 1, fallen: new Set(fallen).add(cell) },
  };
}

function roll(board: Board, at: Point, above: boolean, step: number): Step {
  const cell = toCell(at);
  if (cell === BUTTON) return { event: { type: 'button.pressed', step, by: 'ball' }, next: undefined };
  const stop: Step = { event: { type: 'ball.stopped', step, cell }, next: undefined };
  const part = board.parts.get(cell);
  if (part === undefined) {
    const fan = board.wind.get(cell);
    if (fan !== undefined) return move(at, ahead(at, fan), 'fan', step);
    return at.row === ROWS ? stop : move(at, { col: at.col, row: at.row + 1 }, 'gravity', step);
  }
  switch (part.kind) {
    case 'conveyor':
      return move(at, ahead(at, part), 'conveyor', step);
    case 'ramp': {
      const bottom = at.row === toPoint(part.cell).row + part.length - 1;
      return move(at, { col: at.col + sign(part), row: bottom ? at.row : at.row + 1 }, 'ramp', step);
    }
    case 'dominoes':
      return hit(part, at, at, new Set<Cell>(), step);
    case 'seesaw': {
      const load = { col: toPoint(part.cell).col - sign(part), row: at.row };
      return same(at, load) && above ? launch(at, part, step) : stop;
    }
    case 'catapult':
      return launch(at, part, step);
    case 'fan':
      return stop;
  }
}

// The impulse topples the part's next domino; past the last one it presses the button, triggers another dominoes
// part, or is lost, as it is on reaching a domino that has already fallen.
function topple(board: Board, state: Extract<State, { kind: 'falling' }>, step: number): Step {
  const { ball, part, index, fallen } = state;
  const anchor = toPoint(part.cell);
  const target = footprint(part)[index] ?? { col: anchor.col + part.length * sign(part), row: anchor.row };
  const lost: Step = { event: { type: 'impulse.lost', step, cell: toCell(clamp(target)) }, next: undefined };
  if (!onBoard(target)) return lost;
  const cell = toCell(target);
  if (cell === BUTTON) return { event: { type: 'button.pressed', step, by: 'domino' }, next: undefined };
  const next = board.parts.get(cell);
  return next?.kind === 'dominoes' && !fallen.has(cell) ? hit(next, target, ball, fallen, step) : lost;
}

function advance(board: Board, state: State, step: number): Step {
  switch (state.kind) {
    case 'ball':
      return roll(board, state.at, state.above, step);
    case 'lost':
      return {
        event: { type: 'ball.lost', step, cell: toCell(state.at), edge: state.edge },
        next: undefined,
      };
    case 'falling':
      return topple(board, state, step);
  }
}

const resting = (state: State): Point => (state.kind === 'falling' ? state.ball : state.at);

// One event per step from the release at step 1 (MACHINE-RULES sections 1-4); assumes a validated blueprint.
export function simulate(blueprint: Blueprint): SimEvent[] {
  const board = index(blueprint);
  const hopper = toPoint(HOPPER);
  const start = { col: hopper.col, row: hopper.row + 1 };
  const events: SimEvent[] = [{ type: 'ball.released', step: 1, cell: toCell(start) }];
  let state: State | undefined = { kind: 'ball', at: start, above: true };
  while (state !== undefined) {
    const step = events.length + 1;
    const { event, next }: Step = advance(board, state, step);
    if (step === MAX_STEPS && next !== undefined) {
      events.push({ type: 'ball.stopped', step, cell: toCell(resting(state)) });
      break;
    }
    events.push(event);
    state = next;
  }
  return events;
}

export type Handover = { step: number; from: Part; to: Part | 'button' };

const owner = (board: Board, cell: Cell): Part | 'button' | undefined =>
  cell === BUTTON ? 'button' : (board.parts.get(cell) ?? board.wind.get(cell));

// What the ball or the impulse enters with this event; an arc that leaves the board enters nothing.
function entered(board: Board, blueprint: Blueprint, event: SimEvent): Part | 'button' | undefined {
  switch (event.type) {
    case 'ball.released':
      return owner(board, event.cell);
    case 'ball.moved':
      return owner(board, event.to);
    case 'ball.launched': {
      const part = blueprint.parts.find((p) => p.id === event.part);
      const lands = (part?.kind === 'seesaw' || part?.kind === 'catapult') && onBoard(landing(part));
      return lands ? owner(board, event.to) : undefined;
    }
    case 'domino.fell':
      return blueprint.parts.find((p) => p.id === event.part);
    case 'button.pressed':
      return event.by === 'domino' ? 'button' : undefined; // a ball already entered the button with its move
    case 'impulse.lost':
      return owner(board, event.cell); // off the board the cell is clamped onto the part's own last domino
    case 'ball.lost':
    case 'ball.stopped':
      return undefined;
  }
}

// Handovers are derived from the log, never recorded (MACHINE-RULES section 4); the hopper is not a part.
export function handovers(blueprint: Blueprint, events: SimEvent[]): Handover[] {
  const board = index(blueprint);
  const out: Handover[] = [];
  let last: Part | undefined;
  for (const event of events) {
    const to = entered(board, blueprint, event);
    if (to === undefined) continue;
    if (last !== undefined && (to === 'button' || to.id !== last.id))
      out.push({ step: event.step, from: last, to });
    if (to !== 'button') last = to;
  }
  return out;
}
